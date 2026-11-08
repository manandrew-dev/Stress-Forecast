"""Restore the seeded state of an explicitly designated disposable demo database."""

import argparse
import asyncio
import os
import sys
from collections.abc import Sequence
from typing import NamedTuple

import asyncpg

from db import seed

DESIGNATION = "stress-forecast:disposable-demo:backup-verified:v1"
# Children come first for deletion. Users and courses keep their existing IDs.
RESET_TABLES = ("insights", "checkin_course", "checkins", "deadlines", "rep_assignments", "enrollments")
APP_TABLES = ("users", "courses", *RESET_TABLES)


class ResetPlan(NamedTuple):
    before: dict[str, int]
    restored: dict[str, int]


async def _verify_database(connection: asyncpg.Connection) -> None:
    designated = await connection.fetchval(
        """
        SELECT shobj_description(oid, 'pg_database') = $1 || ':' || datname
        FROM pg_database WHERE datname = current_database()
        """,
        DESIGNATION,
    )
    if not designated:
        raise seed.SeedError("The database is missing the disposable-demo and verified-backup designation.")


async def _inspect_fixture(
    connection: asyncpg.Connection,
    student_sub: str,
    rep_sub: str,
    enrollments: dict[str, tuple[str, ...]],
    checkins: Sequence[seed.Checkin],
) -> tuple[ResetPlan, dict[str, int], dict[tuple[int, str], int]]:
    if await connection.fetchval(
        """
        SELECT EXISTS (
            SELECT FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f')
              AND c.relname::text <> ALL($1::text[])
        )
        """,
        APP_TABLES,
    ):
        raise seed.SeedError("Unexpected tables in the application schema. Reset stopped.")

    if not await connection.fetchval(
        """
        SELECT pg_has_role(c.relowner, 'USAGE')
        FROM timescaledb_information.continuous_aggregates AS a
        JOIN pg_class AS c ON c.oid = 'public.daily_course_stress'::regclass
        WHERE a.view_schema = 'public' AND a.view_name = 'daily_course_stress'
        """,
    ):
        raise seed.SeedError("Run the reset as the owner of the daily_course_stress continuous aggregate.")

    roles = dict(await connection.fetch("SELECT id, role FROM users"))
    if roles != (dict.fromkeys(enrollments, "student") | {rep_sub: "rep"}):
        raise seed.SeedError("Users or roles differ from the seeded demo and its Auth0 mappings. Reset stopped.")
    courses = await connection.fetch("SELECT id, code, name, term FROM courses")
    if len(courses) != len(seed.COURSES) or {
        (row["code"], row["name"], row["term"]) for row in courses
    } != {(code, name, seed.TERM) for code, name in seed.COURSES.items()}:
        raise seed.SeedError("Courses differ from the seeded demo. Reset stopped.")
    course_ids = {row["code"]: row["id"] for row in courses}

    known_courses = {
        user: {course_ids[code] for code in codes} for user, codes in enrollments.items()
    }
    if any(
        user != student_sub and course not in known_courses.get(user, ())
        for user, course in await connection.fetch("SELECT user_id, course_id FROM enrollments")
    ) or await connection.fetchval("SELECT EXISTS (SELECT FROM rep_assignments WHERE user_id <> $1)", rep_sub):
        raise seed.SeedError("Unexpected enrollment or representative assignment. Reset stopped.")

    expected_deadlines = {(course_ids[item.course], item.title) for item in seed.ASSESSMENTS}
    official = {}
    for deadline_id, course, title, creator in await connection.fetch(
        "SELECT id, course_id, title, created_by FROM deadlines",
    ):
        if creator == student_sub:
            continue
        key = (course, title)
        if creator is not None or key not in expected_deadlines or key in official:
            raise seed.SeedError("Unexpected or duplicate deadline. Reset stopped.")
        official[key] = deadline_id

    expected_checkins = {(row.time, row.user_id) for row in checkins}
    if any(
        user != student_sub and (time, user) not in expected_checkins
        for time, user in await connection.fetch("SELECT time, user_id FROM checkins")
    ):
        raise seed.SeedError("Unexpected check-in outside the mapped demo student and seeded history. Reset stopped.")
    if any(
        user != student_sub and course not in known_courses.get(user, ())
        for user, course in await connection.fetch("SELECT DISTINCT user_id, course_id FROM checkin_course")
    ) or await connection.fetchval(
        """
        SELECT EXISTS (
            SELECT FROM checkin_course AS cc
            LEFT JOIN checkins AS c ON (cc.user_id, cc.time) = (c.user_id, c.time)
            WHERE c.user_id IS NULL
        )
        """,
    ):
        raise seed.SeedError("Unexpected course check-in or missing parent check-in. Reset stopped.")
    if await connection.fetchval("SELECT EXISTS (SELECT FROM insights WHERE course_id IS NULL)"):
        raise seed.SeedError("Unexpected insight without a demo course. Reset stopped.")

    before = {table: await connection.fetchval(f"SELECT count(*) FROM {table}") for table in APP_TABLES}
    restored = {
        "users": len(roles),
        "courses": len(courses),
        "insights": 0,
        "checkin_course": sum(len(enrollments[row.user_id]) for row in checkins),
        "checkins": len(checkins),
        "deadlines": len(seed.ASSESSMENTS),
        "rep_assignments": len(seed.REP_COURSES),
        "enrollments": sum(map(len, enrollments.values())),
    }
    return ResetPlan(before, restored), course_ids, official


async def _refresh(connection: asyncpg.Connection) -> None:
    # Live check-ins may have been materialized outside the seed's history. Process all
    # invalidated buckets so a retry can also clear them after the source rows are gone.
    await connection.execute(
        "CALL public.refresh_continuous_aggregate('public.daily_course_stress', NULL::timestamptz, NULL::timestamptz)",
    )


async def _restore(
    connection: asyncpg.Connection, student_sub: str, rep_sub: str, *, dry_run: bool,
) -> ResetPlan:
    enrollments = seed.demo_enrollments(student_sub)
    checkins = seed.generate_checkins(enrollments)
    async with connection.transaction(
        isolation="repeatable_read" if dry_run else "read_committed", readonly=dry_run,
    ):
        await connection.execute("SET LOCAL search_path = pg_catalog, public")
        await _verify_database(connection)
        if not dry_run:
            # Prevent application writes between validation and reseeding, including inserts
            # of new users or courses. Time out instead of hanging on an active demo.
            await connection.execute("SET LOCAL lock_timeout = '5s'")
            await connection.execute(f"LOCK TABLE {', '.join(APP_TABLES)} IN SHARE ROW EXCLUSIVE MODE")
        plan, course_ids, official = await _inspect_fixture(connection, student_sub, rep_sub, enrollments, checkins)
        if not dry_run:
            for table in RESET_TABLES:
                if table == "deadlines":
                    await connection.execute("DELETE FROM deadlines WHERE created_by = $1", student_sub)
                else:
                    await connection.execute(f"DELETE FROM {table}")
            await seed.write_demo_rows(
                connection, rep_sub, enrollments, course_ids, checkins, existing_deadlines=official,
            )
    return plan


async def reset_demo(
    connection: asyncpg.Connection, student_sub: str, rep_sub: str, *, dry_run: bool = False,
) -> ResetPlan:
    """Verify the fixture, restore it atomically, then refresh TimescaleDB outside the transaction."""
    seed._validate_subjects(student_sub, rep_sub)
    if connection.is_in_transaction():
        raise seed.SeedError("Use a standalone connection. The aggregate refresh must run after commit.")
    if dry_run:
        return await _restore(connection, student_sub, rep_sub, dry_run=True)
    if not await connection.fetchval("SELECT pg_try_advisory_lock(hashtextextended($1, 0))", seed.DEMO_LOCK_KEY):
        raise seed.SeedError("Another demo seed or reset is running. Try again after it finishes.")
    try:
        plan = await _restore(connection, student_sub, rep_sub, dry_run=False)
        try:
            await _refresh(connection)
        except seed._DATABASE_ERRORS:
            raise seed.SeedError(
                "Demo rows were restored, but aggregate refresh failed. Keep writers paused and rerun the reset.",
            ) from None
        return plan
    finally:
        if not connection.is_closed():
            await connection.fetchval("SELECT pg_advisory_unlock(hashtextextended($1, 0))", seed.DEMO_LOCK_KEY)


async def _run(dry_run: bool) -> ResetPlan:
    database_url = seed._database_url()
    student_sub = os.getenv("DEMO_STUDENT_SUB", "")
    rep_sub = os.getenv("DEMO_REP_SUB", "")
    seed._validate_subjects(student_sub, rep_sub)
    try:
        connection = await asyncpg.connect(database_url, timeout=10, command_timeout=120)
    except seed._DATABASE_ERRORS:
        raise seed.SeedError("Could not connect to the demo database. Check DATABASE_URL and connectivity.") from None
    try:
        return await reset_demo(connection, student_sub, rep_sub, dry_run=dry_run)
    except seed._DATABASE_ERRORS:
        raise seed.SeedError("Database operation failed. Check the demo schema, permissions, and concurrent writers.") from None
    finally:
        await connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-demo", action="store_true", help="confirm the disposable demo database may be reset")
    parser.add_argument("--dry-run", action="store_true", help="validate the database and show counts without writing")
    args = parser.parse_args(argv)
    if not args.dry_run and not args.confirm_demo:
        parser.error("--confirm-demo is required for database writes")
    try:
        plan = asyncio.run(_run(args.dry_run))
    except seed.SeedError as error:
        print(f"Reset error: {error}", file=sys.stderr)
        return 1
    if args.dry_run:
        print("Dry run. No changes made. Users and courses would be preserved.")
    else:
        print(f"Restored the {seed.TERM} demo and refreshed daily_course_stress. Users and courses were preserved.")
    for table in APP_TABLES:
        print(f"  {table}: {plan.before[table]} -> {plan.restored[table]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
