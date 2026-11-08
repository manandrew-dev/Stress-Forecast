import asyncio
import datetime as dt
import os
from urllib.parse import parse_qs, urlsplit

import asyncpg
import pytest

from backend.app.models import Deadline
from backend.app.services import cohort
from backend.app.services.collisions import cross_course_rep_collisions
from db import reset_demo, seed

STUDENT = "auth0|fixture-student"
REP = "auth0|fixture-rep"


def test_reset_requires_confirmation_before_connecting(capsys):
    with pytest.raises(SystemExit) as error:
        reset_demo.main([])
    assert error.value.code == 2
    assert "--confirm-demo is required" in capsys.readouterr().err


def test_dry_run_does_not_require_confirmation(monkeypatch, capsys):
    async def run(dry_run):
        assert dry_run
        return reset_demo.ResetPlan(dict.fromkeys(reset_demo.APP_TABLES, 1), dict.fromkeys(reset_demo.APP_TABLES, 0))

    monkeypatch.setattr(reset_demo, "_run", run)
    assert reset_demo.main(["--dry-run"]) == 0
    assert "No changes made" in capsys.readouterr().out


def test_connect_failure_does_not_print_credentials(monkeypatch, capsys):
    async def connect(*args, **kwargs):
        raise OSError("do not print this test secret")

    monkeypatch.setattr(seed.config, "DATABASE_URL", "postgresql://localhost/demo_test")
    monkeypatch.setenv("DEMO_STUDENT_SUB", STUDENT)
    monkeypatch.setenv("DEMO_REP_SUB", REP)
    monkeypatch.setattr(asyncpg, "connect", connect)
    assert reset_demo.main(["--confirm-demo"]) == 1
    error = capsys.readouterr().err
    assert "Could not connect" in error
    assert "test secret" not in error


async def _snapshot(connection):
    return {
        table: await connection.fetch(f"SELECT to_jsonb(t)::text AS row FROM {table} AS t ORDER BY 1")
        for table in (*reset_demo.APP_TABLES, "daily_course_stress")
    }


async def _assert_collision(connection, focus_id):
    students = await cohort.cohort_course_sets(connection, focus_id)
    deadlines = [
        Deadline(**dict(row)) for row in await connection.fetch(
            "SELECT id, course_id, title, due_date, weight_pct, type, created_by FROM deadlines",
        )
    ]
    collisions = cross_course_rep_collisions(focus_id, deadlines, students, [], seed.config.COHORT_MIN)
    [week_nine] = [window for window in collisions if window.start == dt.date(2026, 11, 3)]
    assert (len(students), week_nine.students_affected, week_nine.total_weight_pct) == (25, 10, 55)
    assert week_nine.end == seed.DEMO_DAY
    assert {deadline.course_id for deadline in week_nine.deadlines} != {focus_id}


def test_reset_timescaledb(monkeypatch):
    url = os.getenv("RESET_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set RESET_TEST_DATABASE_URL to an empty local TimescaleDB database")
    parsed = urlsplit(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    assert parsed.scheme in {"postgresql", "postgres"} and parsed.path.endswith("_test")
    assert (
        parsed.hostname in {"localhost", "127.0.0.1", "::1"} and not query
        or not parsed.netloc and set(query) <= {"host", "port"}
        and len(query.get("host", [])) == 1 and query["host"][0].startswith("/") and "," not in query["host"][0]
    ), "Use a local TCP connection or an explicit Unix socket"

    async def check():
        connection = await asyncpg.connect(url, timeout=10, command_timeout=60)
        try:
            address = await connection.fetchval("SELECT inet_server_addr()")
            assert address is None or address.is_loopback
            for table in reset_demo.APP_TABLES:
                assert not await connection.fetchval(f"SELECT count(*) FROM {table}"), "Use a fresh test database"
            assert await seed.seed_demo(connection, STUDENT, REP) == 1992
            await seed.refresh_demo_history(connection)
            baseline = await _snapshot(connection)
            expected_counts = {
                "users": 41, "courses": 4, "insights": 0, "checkin_course": 4479,
                "checkins": 1992, "deadlines": 18, "rep_assignments": 3, "enrollments": 90,
            }
            assert {table: len(baseline[table]) for table in reset_demo.APP_TABLES} == expected_counts
            with pytest.raises(seed.SeedError, match="designation"):
                await reset_demo.reset_demo(connection, STUDENT, REP)
            assert await _snapshot(connection) == baseline
            designation = await connection.fetchval(
                "SELECT format('COMMENT ON DATABASE %I IS %L', current_database(), $1::text || ':' || current_database())",
                reset_demo.DESIGNATION,
            )
            await connection.execute(designation)
            focus_id = await connection.fetchval("SELECT id FROM courses WHERE code = $1", seed.FOCUS_COURSE)
            await _assert_collision(connection, focus_id)

            stamp = dt.datetime.combine(seed.DEMO_DAY, dt.time(12), seed.VANCOUVER)
            await connection.execute(
                "INSERT INTO checkins (time, user_id, stress, raw_text) VALUES ($1, $2, 9, 'Test check-in')", stamp, STUDENT,
            )
            await connection.execute("INSERT INTO checkin_course VALUES ($1, $2, $3, 9)", stamp, focus_id, STUDENT)
            await connection.execute(
                """
                CALL refresh_continuous_aggregate(
                    'daily_course_stress', $1::timestamptz, $2::timestamptz
                )
                """,
                stamp.replace(hour=0), stamp.replace(hour=0) + dt.timedelta(days=1),
            )
            assert await connection.fetchval(
                "SELECT n_students FROM daily_course_stress WHERE day = $1 AND course_id = $2",
                stamp.replace(hour=0), focus_id,
            ) == 1
            await connection.execute(
                "UPDATE deadlines SET due_date = DATE '2026-11-20', weight_pct = 5 WHERE course_id = $1 AND title = 'Midterm 2'",
                focus_id,
            )
            await connection.execute(
                """
                INSERT INTO deadlines (course_id, title, due_date, type, created_by)
                VALUES ($1, 'Student deadline', DATE '2026-11-07', 'other', $2)
                """,
                focus_id, STUDENT,
            )
            await connection.execute("DELETE FROM enrollments WHERE user_id = $1 AND course_id = $2", STUDENT, focus_id)
            await connection.execute("DELETE FROM rep_assignments WHERE user_id = $1 AND course_id = $2", REP, focus_id)
            await connection.execute(
                "INSERT INTO insights (course_id, week_start, finding) VALUES ($1, DATE '2026-11-02', 'Test finding')",
                focus_id,
            )
            edited = await _snapshot(connection)
            plan = await reset_demo.reset_demo(connection, STUDENT, REP, dry_run=True)
            assert plan.before["checkins"] == 1993 and plan.before["insights"] == 1 and plan.restored == expected_counts
            assert await _snapshot(connection) == edited
            with pytest.raises(seed.SeedError, match="Auth0 mappings"):
                await reset_demo.reset_demo(connection, "auth0|wrong-student", REP)
            assert await _snapshot(connection) == edited

            for statement, error in (
                ("INSERT INTO users (id, role) VALUES ('outside-demo', 'student')", "Users or roles"),
                ("INSERT INTO courses (code, name, term) VALUES ('OUTSIDE', 'Other course', '2026W1')", "Courses differ"),
                ("INSERT INTO insights (week_start, finding) VALUES (DATE '2026-11-02', 'Unscoped')", "Unexpected insight"),
                ("INSERT INTO deadlines (course_id, title, due_date, type) "
                 "SELECT min(id), 'Unrecognized deadline', DATE '2026-11-07', 'other' FROM courses", "Unexpected.*deadline"),
                ("INSERT INTO checkin_course (time, course_id, user_id, stress) "
                 "SELECT TIMESTAMPTZ '2026-11-08 12:00Z', course_id, user_id, 9 FROM checkin_course LIMIT 1",
                 "Unexpected course check-in|Unexpected check-in"),
            ):
                await connection.execute(statement)
                unexpected = await _snapshot(connection)
                with pytest.raises(seed.SeedError, match=error):
                    await reset_demo.reset_demo(connection, STUDENT, REP)
                assert await _snapshot(connection) == unexpected
                await connection.execute("""
                    DELETE FROM users WHERE id = 'outside-demo';
                    DELETE FROM courses WHERE code = 'OUTSIDE';
                    DELETE FROM insights WHERE course_id IS NULL;
                    DELETE FROM deadlines WHERE title = 'Unrecognized deadline';
                    DELETE FROM checkin_course WHERE time = TIMESTAMPTZ '2026-11-08 12:00Z';
                """)
                assert await _snapshot(connection) == edited

            original_write = seed.write_demo_rows

            async def failed_write(conn, *args, **kwargs):
                await original_write(conn, *args, **kwargs)
                await conn.execute("SELECT 1 / 0")

            with monkeypatch.context() as patch:
                patch.setattr(seed, "write_demo_rows", failed_write)
                with pytest.raises(asyncpg.DivisionByZeroError):
                    await reset_demo.reset_demo(connection, STUDENT, REP)
            assert await _snapshot(connection) == edited

            async def failed_refresh(conn):
                assert not conn.is_in_transaction()
                raise asyncpg.InsufficientPrivilegeError()

            with monkeypatch.context() as patch:
                patch.setattr(reset_demo, "_refresh", failed_refresh)
                with pytest.raises(seed.SeedError, match="rows were restored.*refresh failed"):
                    await reset_demo.reset_demo(connection, STUDENT, REP)
            before_refresh = await _snapshot(connection)
            for table in reset_demo.APP_TABLES:
                assert before_refresh[table] == baseline[table]

            original_refresh = reset_demo._refresh

            async def verify_reset_lock(conn):
                second = await asyncpg.connect(url, timeout=10)
                try:
                    with pytest.raises(seed.SeedError, match="Another demo seed or reset"):
                        await reset_demo.reset_demo(second, STUDENT, REP)
                finally:
                    await second.close()
                await original_refresh(conn)

            with monkeypatch.context() as patch:
                patch.setattr(reset_demo, "_refresh", verify_reset_lock)
                plan = await reset_demo.reset_demo(connection, STUDENT, REP)
            assert plan.before == plan.restored == expected_counts
            assert await _snapshot(connection) == baseline
            await _assert_collision(connection, focus_id)
            assert await reset_demo.reset_demo(connection, STUDENT, REP) == plan
            assert await _snapshot(connection) == baseline
            assert dict(await connection.fetch(
                "SELECT id, role FROM users WHERE id = ANY($1::text[])", [STUDENT, REP],
            )) == {STUDENT: "student", REP: "rep"}
        finally:
            await connection.close()

    asyncio.run(check())
