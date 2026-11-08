"""Populate a dedicated demo database. Run from the repository root with -m db.seed."""

import argparse
import asyncio
import datetime as dt
import os
import random
import sys
from collections.abc import Sequence
from typing import NamedTuple
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import asyncpg

from backend.app import config
from backend.app.models import DeadlineType

TERM = "2026W1"
TERM_START = dt.date(2026, 9, 8)
DEMO_DAY = dt.date(2026, 11, 7)
LOW_RESPONSE_DAY = dt.date(2026, 9, 13)
VANCOUVER = ZoneInfo("America/Vancouver")
STUDENT_COUNT = 40
FICTIONAL_PREFIX = "stressforecast-demo:student:"
FOCUS_COURSE = "DEMO CPSC 210"
MATH_COURSE = "DEMO MATH 200"
COURSES = {
    FOCUS_COURSE: "Software Construction",
    MATH_COURSE: "Calculus III",
    "DEMO PHYS 118": "Electricity, Light and Radiation",
    "DEMO ENGL 110": "Approaches to Literature",
}
REP_COURSES = (FOCUS_COURSE, MATH_COURSE, "DEMO ENGL 110")
_ENROLLMENT_PATTERNS = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3), (0, 1, 2), (0, 2, 3))
_DEADLINE_LOAD = {3: 0.45, 2: 0.75, 1: 1.0, 0: 0.70}
_DATABASE_ERRORS = (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, ValueError)


class Assessment(NamedTuple):
    course: str
    title: str
    due_date: dt.date
    weight: int
    kind: DeadlineType


ASSESSMENTS = (
    Assessment(FOCUS_COURSE, "Project Phase 1", dt.date(2026, 9, 29), 10, "project"),
    Assessment(FOCUS_COURSE, "Midterm 1", dt.date(2026, 10, 6), 15, "midterm"),
    Assessment(FOCUS_COURSE, "Midterm 2", dt.date(2026, 11, 3), 20, "midterm"),
    Assessment(FOCUS_COURSE, "Project Phase 3", dt.date(2026, 11, 19), 25, "project"),
    Assessment(FOCUS_COURSE, "Quiz 4", dt.date(2026, 11, 7), 10, "quiz"),
    Assessment(FOCUS_COURSE, "Final Exam", dt.date(2026, 12, 10), 20, "exam"),
    Assessment(MATH_COURSE, "Problem Set 1", dt.date(2026, 9, 18), 10, "assignment"),
    Assessment(MATH_COURSE, "Midterm 1", dt.date(2026, 10, 8), 25, "midterm"),
    Assessment(MATH_COURSE, "Midterm 2", dt.date(2026, 11, 5), 25, "midterm"),
    Assessment(MATH_COURSE, "Final Exam", dt.date(2026, 12, 14), 40, "exam"),
    Assessment("DEMO PHYS 118", "Lab Report 1", dt.date(2026, 9, 25), 15, "assignment"),
    Assessment("DEMO PHYS 118", "Midterm", dt.date(2026, 10, 21), 25, "midterm"),
    Assessment("DEMO PHYS 118", "Circuits Project", dt.date(2026, 11, 23), 25, "project"),
    Assessment("DEMO PHYS 118", "Final Exam", dt.date(2026, 12, 12), 35, "exam"),
    Assessment("DEMO ENGL 110", "Reading Response", dt.date(2026, 9, 24), 10, "assignment"),
    Assessment("DEMO ENGL 110", "Close Reading Essay", dt.date(2026, 10, 15), 30, "assignment"),
    Assessment("DEMO ENGL 110", "Research Proposal", dt.date(2026, 11, 16), 20, "assignment"),
    Assessment("DEMO ENGL 110", "Research Essay", dt.date(2026, 12, 4), 40, "assignment"),
)
_ORIGINAL_DATES = {
    (FOCUS_COURSE, "Project Phase 3"): dt.date(2026, 11, 5),
    (MATH_COURSE, "Midterm 2"): dt.date(2026, 11, 19),
}
_ORIGINAL_ASSESSMENTS = tuple(
    item._replace(due_date=_ORIGINAL_DATES.get((item.course, item.title), item.due_date))
    for item in ASSESSMENTS
)


class Checkin(NamedTuple):
    time: dt.datetime
    user_id: str
    stress: int
    sleep_hours: float | None
    causes: tuple[str, ...]
    raw_text: str


class SeedError(Exception):
    """An actionable seed failure safe to print without connection details."""


def _validate_subjects(student_sub: str, rep_sub: str) -> None:
    if student_sub == rep_sub or any(
        not sub or sub.startswith(FICTIONAL_PREFIX) or "\x00" in sub or any(c.isspace() for c in sub)
        for sub in (student_sub, rep_sub)
    ):
        raise SeedError("Set DEMO_STUDENT_SUB and DEMO_REP_SUB to distinct Auth0 demo user IDs.")


def demo_enrollments(student_sub: str) -> dict[str, tuple[str, ...]]:
    students = [student_sub, *(f"{FICTIONAL_PREFIX}{i:02d}" for i in range(1, STUDENT_COUNT))]
    course_codes = tuple(COURSES)
    return {
        user_id: tuple(course_codes[i] for i in _ENROLLMENT_PATTERNS[index % len(_ENROLLMENT_PATTERNS)])
        for index, user_id in enumerate(students)
    }


def generate_checkins(
    enrollments: dict[str, tuple[str, ...]], assessments: Sequence[Assessment] | None = None,
) -> list[Checkin]:
    assessments = ASSESSMENTS if assessments is None else assessments
    rng = random.Random(2026)
    history = []
    for index, (user_id, courses) in enumerate(enrollments.items()):
        baseline = rng.uniform(2.5, 4.1)
        sensitivity = rng.uniform(0.8, 1.2)
        deadlines = [assessment for assessment in assessments if assessment.course in courses]
        for offset in range((DEMO_DAY - TERM_START).days):
            day = TERM_START + dt.timedelta(days=offset)
            if day == LOW_RESPONSE_DAY:
                if index >= config.COHORT_MIN - 1:
                    continue
            elif index > 0 and rng.random() < 0.16:
                continue

            load = sum(
                assessment.weight / 8 * _DEADLINE_LOAD.get((assessment.due_date - day).days, 0)
                for assessment in deadlines
            )
            stress = min(10, max(1, round(baseline + sensitivity * load + rng.uniform(-0.65, 0.65))))
            sleep = None if rng.random() < 0.10 else round(8.8 - stress * 0.35 + rng.uniform(-0.5, 0.5), 1)
            busy = load >= 1.2
            text = (
                "I spent most of today preparing for upcoming assessments and felt pressed for time."
                if busy else "Classes felt manageable today and I kept up with the work."
            )
            history.append(Checkin(
                dt.datetime.combine(day, dt.time(18, index), VANCOUVER),
                user_id, stress, sleep, ("assessment deadlines",) if busy else (), text,
            ))
    return history


async def _upgrade_history(
    connection: asyncpg.Connection, enrollments: dict[str, tuple[str, ...]], course_ids: dict[str, int],
    *, already_upgraded: bool,
) -> int | None:
    changes = [
        (old, new)
        for old, new in zip(
            generate_checkins(enrollments, _ORIGINAL_ASSESSMENTS), generate_checkins(enrollments), strict=True,
        )
        if old != new
    ]
    expected_history = [new if already_upgraded else old for old, new in changes]
    stored = await connection.fetchmany(
        """
        SELECT 1 FROM checkins WHERE time = $1 AND user_id = $2
          AND (stress, sleep_hours, causes, raw_text) IS NOT DISTINCT FROM
              ($3::smallint, $4::numeric, $5::text[], $6::text)
        FOR UPDATE
        """,
        expected_history,
    )
    if len(stored) != len(expected_history):
        raise SeedError("Demo check-ins differ from the expected fixture version. Upgrade stopped.")

    expected_fanout = {
        (row.time, course_ids[code], row.user_id, row.stress)
        for row in expected_history for code in enrollments[row.user_id]
    }
    actual_fanout = await connection.fetch(
        """
        SELECT cc.time, cc.course_id, cc.user_id, cc.stress
        FROM checkin_course AS cc
        JOIN unnest($1::timestamptz[], $2::text[]) AS target(time, user_id) USING (time, user_id)
        FOR UPDATE OF cc
        """,
        [row.time for row in expected_history], [row.user_id for row in expected_history],
    )
    if {tuple(row) for row in actual_fanout} != expected_fanout:
        raise SeedError("Demo course check-ins differ from the expected fixture version. Upgrade stopped.")
    if already_upgraded:
        return None

    await connection.executemany(
        """
        UPDATE checkins SET stress = $3, sleep_hours = $4, causes = $5, raw_text = $6
        WHERE time = $1 AND user_id = $2
        """,
        (new for _, new in changes),
    )
    await connection.executemany(
        "UPDATE checkin_course SET stress = $4 WHERE time = $1 AND course_id = $2 AND user_id = $3",
        (
            (new.time, course_ids[code], new.user_id, new.stress)
            for old, new in changes if old.stress != new.stress for code in enrollments[new.user_id]
        ),
    )
    return len(changes)


async def _upgrade_demo(
    connection: asyncpg.Connection, student_sub: str, rep_sub: str, course_ids: dict[str, int],
) -> int | None:
    enrollments = demo_enrollments(student_sub)
    expected_roles = dict.fromkeys(enrollments, "student") | {rep_sub: "rep"}
    # Match the application's check-in lock so active check-ins cannot race the upgrade.
    accounts = await connection.fetch(
        "SELECT id, role FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE", list(expected_roles),
    )
    stored_enrollments = await connection.fetch(
        """
        SELECT user_id, course_id FROM enrollments
        WHERE course_id = ANY($1::int[]) OR user_id = ANY($2::text[])
        FOR UPDATE
        """,
        list(course_ids.values()), list(expected_roles),
    )
    assignments = await connection.fetch(
        "SELECT course_id FROM rep_assignments WHERE user_id = $1 FOR UPDATE", rep_sub,
    )
    if (
        dict(accounts) != expected_roles
        or {tuple(row) for row in stored_enrollments}
        != {(user_id, course_ids[code]) for user_id, codes in enrollments.items() for code in codes}
        or {row["course_id"] for row in assignments} != {course_ids[code] for code in REP_COURSES}
    ):
        raise SeedError("Demo accounts, enrollments, or rep assignments differ from the fixture. Upgrade stopped.")

    official = await connection.fetch(
        """
        SELECT d.id, c.code, d.title, d.due_date, d.weight_pct, d.type
        FROM deadlines AS d JOIN courses AS c ON d.course_id = c.id
        WHERE d.course_id = ANY($1::int[]) AND d.created_by IS NULL
        FOR UPDATE OF d
        """,
        list(course_ids.values()),
    )
    deadline_ids = {Assessment(*row[1:]): row["id"] for row in official}
    already_upgraded = len(official) == len(ASSESSMENTS) and deadline_ids.keys() == set(ASSESSMENTS)
    original = len(official) == len(_ORIGINAL_ASSESSMENTS) and deadline_ids.keys() == set(_ORIGINAL_ASSESSMENTS)
    if not (already_upgraded or original):
        raise SeedError("Official demo deadlines do not match a supported fixture version. Upgrade stopped.")

    count = await _upgrade_history(connection, enrollments, course_ids, already_upgraded=already_upgraded)
    if count is None:
        return None
    await connection.executemany(
        "UPDATE deadlines SET due_date = $2 WHERE id = $1 AND created_by IS NULL",
        (
            (deadline_ids[old], new.due_date)
            for old, new in zip(_ORIGINAL_ASSESSMENTS, ASSESSMENTS, strict=True) if old != new
        ),
    )
    return count


async def seed_demo(
    connection: asyncpg.Connection, student_sub: str, rep_sub: str, *, upgrade: bool = False,
) -> int | None:
    """Insert a fresh fixture or explicitly upgrade v1, returning the check-in count affected."""
    _validate_subjects(student_sub, rep_sub)
    async with connection.transaction():
        # The schema has no uniqueness constraint on course code and term.
        await connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", f"stress-forecast-demo:{TERM}",
        )
        existing = await connection.fetch(
            "SELECT id, code, name FROM courses WHERE term = $1 AND code = ANY($2::text[])",
            TERM, list(COURSES),
        )
        if existing:
            if len(existing) != len(COURSES) or {row["code"]: row["name"] for row in existing} != COURSES:
                raise SeedError("Reserved demo course codes conflict with existing rows. Use a fresh demo database.")
            if upgrade:
                return await _upgrade_demo(
                    connection, student_sub, rep_sub, {row["code"]: row["id"] for row in existing},
                )
            return None
        if upgrade:
            raise SeedError("No existing demo fixture found. Omit --upgrade-cross-course for a fresh seed.")

        demo_roles = {student_sub: "student", rep_sub: "rep"}
        await connection.executemany(
            "INSERT INTO users (id, role) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
            demo_roles.items(),
        )
        accounts = await connection.fetch(
            "SELECT id, role FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE", list(demo_roles),
        )
        if dict(accounts) != demo_roles:
            raise SeedError("An existing demo account has a different database role. Check the two Auth0 mappings.")
        if await connection.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM enrollments WHERE user_id = ANY($1::text[])
                UNION ALL SELECT 1 FROM rep_assignments WHERE user_id = ANY($1::text[])
                UNION ALL SELECT 1 FROM checkins WHERE user_id = ANY($1::text[])
                UNION ALL SELECT 1 FROM checkin_course WHERE user_id = ANY($1::text[])
                UNION ALL SELECT 1 FROM deadlines WHERE created_by = ANY($1::text[])
            )
            """,
            list(demo_roles),
        ):
            raise SeedError("A demo account already has application data. Use dedicated demo accounts.")

        enrollments = demo_enrollments(student_sub)
        await connection.executemany(
            "INSERT INTO users (id, role) VALUES ($1, 'student')",
            ((user_id,) for user_id in enrollments if user_id != student_sub),
        )
        course_ids = {
            code: await connection.fetchval(
                "INSERT INTO courses (code, name, term) VALUES ($1, $2, $3) RETURNING id",
                code, name, TERM,
            )
            for code, name in COURSES.items()
        }
        await connection.executemany(
            "INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)",
            ((user_id, course_ids[code]) for user_id, courses in enrollments.items() for code in courses),
        )
        await connection.executemany(
            "INSERT INTO rep_assignments (user_id, course_id) VALUES ($1, $2)",
            ((rep_sub, course_ids[code]) for code in REP_COURSES),
        )
        await connection.executemany(
            "INSERT INTO deadlines (course_id, title, due_date, weight_pct, type) VALUES ($1, $2, $3, $4, $5)",
            (
                (course_ids[item.course], item.title, item.due_date, item.weight, item.kind)
                for item in ASSESSMENTS
            ),
        )
        checkins = generate_checkins(enrollments)
        await connection.executemany(
            "INSERT INTO checkins (time, user_id, stress, sleep_hours, causes, raw_text) VALUES ($1, $2, $3, $4, $5, $6)",
            checkins,
        )
        await connection.executemany(
            "INSERT INTO checkin_course (time, course_id, user_id, stress) VALUES ($1, $2, $3, $4)",
            (
                (row.time, course_ids[code], row.user_id, row.stress)
                for row in checkins for code in enrollments[row.user_id]
            ),
        )
    return len(checkins)


async def refresh_demo_history(connection: asyncpg.Connection) -> None:
    await connection.execute(
        "CALL refresh_continuous_aggregate('daily_course_stress', $1::timestamptz, $2::timestamptz)",
        dt.datetime.combine(TERM_START, dt.time.min, VANCOUVER),
        dt.datetime.combine(DEMO_DAY, dt.time.min, VANCOUVER),
    )


def _database_url() -> str:
    value = config.DATABASE_URL or ""
    try:
        url = urlsplit(value)
        if url.scheme in {"postgres", "postgresql"} and url.path.strip("/") and (
            url.hostname or parse_qs(url.query).get("host")
        ):
            return value
    except ValueError:
        pass
    raise SeedError("Set DATABASE_URL to a PostgreSQL URL with an explicit host and demo database.")


async def _run(refresh: bool, upgrade: bool) -> None:
    database_url = _database_url()
    student_sub = os.getenv("DEMO_STUDENT_SUB", "")
    rep_sub = os.getenv("DEMO_REP_SUB", "")
    _validate_subjects(student_sub, rep_sub)
    try:
        connection = await asyncpg.connect(database_url, timeout=10, command_timeout=120)
    except _DATABASE_ERRORS:
        raise SeedError("Could not connect to the demo database. Check DATABASE_URL and connectivity.") from None

    try:
        try:
            count = await seed_demo(connection, student_sub, rep_sub, upgrade=upgrade)
        except _DATABASE_ERRORS:
            raise SeedError("Could not seed the demo database. Check the schema and database permissions.") from None

        if upgrade and count is None:
            print(f"{TERM} cross-course demo deadlines are already installed.")
        elif upgrade:
            print(f"Upgraded {TERM} to cross-course demo deadlines and updated {count} historical check-ins.")
        elif count is None:
            print(f"{TERM} demo courses already exist. Preserved the existing seed rows and account mappings.")
        else:
            print(f"Seeded {TERM}: {STUDENT_COUNT} students, {len(COURSES)} courses, and {count} check-ins.")

        if refresh:
            try:
                await refresh_demo_history(connection)
            except _DATABASE_ERRORS:
                raise SeedError("Demo rows are ready. Check aggregate ownership and retry with --refresh.") from None
            print("Refreshed the demo history in daily_course_stress.")
    finally:
        await connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed Stress Forecast's fictional demo term.")
    parser.add_argument("--confirm-demo", action="store_true", help="confirm DATABASE_URL targets a dedicated demo database")
    parser.add_argument("--upgrade-cross-course", action="store_true", help="upgrade the original fixture in place")
    parser.add_argument("--refresh", action="store_true", help="materialize the bounded demo history after seeding")
    args = parser.parse_args(argv)
    if not args.confirm_demo:
        parser.error("--confirm-demo is required for database writes")
    try:
        asyncio.run(_run(args.refresh, args.upgrade_cross_course))
    except SeedError as error:
        print(f"Seed error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
