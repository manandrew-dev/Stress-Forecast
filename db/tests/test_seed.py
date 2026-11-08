import asyncio
import datetime as dt
import os
from collections import Counter
from statistics import mean

import asyncpg
import pytest

from backend.app.models import Deadline
from backend.app.services.collisions import find_collisions, heads_up, rep_collisions
from db import seed

STUDENT = "auth0|fixture-student"
REP = "auth0|fixture-rep"


def test_term_courses_and_enrollments():
    enrollments = seed.demo_enrollments(STUDENT)
    assert seed.TERM == "2026W1"
    assert len(enrollments) == 40
    assert sum(user_id.startswith(seed.FICTIONAL_PREFIX) for user_id in enrollments) == 39
    assert len(seed.COURSES) == 4
    assert all(len(codes) >= 2 and set(codes) <= seed.COURSES.keys() for codes in enrollments.values())
    counts = Counter(code for codes in enrollments.values() for code in codes)
    assert all(counts[code] >= seed.config.COHORT_MIN for code in seed.COURSES)
    assert all(item.course in seed.COURSES for item in seed.ASSESSMENTS)


def test_reproducible_checkins_with_variation_and_leadup():
    enrollments = seed.demo_enrollments(STUDENT)
    rows = seed.generate_checkins(enrollments)
    assert rows == seed.generate_checkins(enrollments)
    days = [(row.user_id, row.time.date()) for row in rows]
    assert len(days) == len(set(days))
    assert all(seed.TERM_START <= day < seed.DEMO_DAY for _, day in days)
    assert all(1 <= row.stress <= 10 and row.user_id in enrollments for row in rows)
    assert max(row.time.date() for row in rows if row.user_id == STUDENT) == seed.DEMO_DAY - dt.timedelta(days=1)

    focus = [row for row in rows if seed.FOCUS_COURSE in enrollments[row.user_id]]
    quiet = mean(row.stress for row in focus if dt.date(2026, 10, 24) <= row.time.date() <= dt.date(2026, 10, 29))
    due = dt.date(2026, 11, 3)
    for lead in (1, 2, 3):
        day = due - dt.timedelta(days=lead)
        stress = [row.stress for row in focus if row.time.date() == day]
        assert len(set(stress)) >= 2
        assert mean(stress) > quiet + 0.5


def test_week_nine_collision_uses_real_detector():
    deadlines = [
        Deadline(
            id=index, course_id=1, title=item.title, due_date=item.due_date,
            weight_pct=item.weight, type=item.kind,
        )
        for index, item in enumerate(seed.ASSESSMENTS, 1) if item.course == seed.FOCUS_COURSE
    ]
    [collision] = find_collisions(deadlines)
    assert (collision.start, collision.end) == (dt.date(2026, 11, 3), dt.date(2026, 11, 7))
    first_monday = seed.TERM_START - dt.timedelta(days=seed.TERM_START.weekday())
    assert 1 + (collision.start - first_monday).days // 7 == 9
    assert collision.deadline_count == 3 and collision.total_weight_pct == 55
    assert {item.title for item in collision.deadlines} == {"Midterm 2", "Project Phase 3", "Quiz 4"}
    assert heads_up(deadlines, seed.DEMO_DAY)[0].total_weight_pct == 55


def test_explicit_demo_confirmation_is_required(capsys):
    with pytest.raises(SystemExit) as error:
        seed.main([])
    assert error.value.code == 2
    assert "--confirm-demo is required" in capsys.readouterr().err


@pytest.mark.parametrize("url", [None, "invalid-url", "postgresql:///", "https://user:test-secret@invalid.example/db"])
def test_invalid_database_url_is_rejected_without_details(monkeypatch, capsys, url):
    monkeypatch.setattr(seed.config, "DATABASE_URL", url)
    assert seed.main(["--confirm-demo"]) == 1
    error = capsys.readouterr().err
    assert "DATABASE_URL" in error and "test-secret" not in error


@pytest.mark.parametrize("student,rep", [("", REP), (STUDENT, ""), (STUDENT, STUDENT), (seed.FICTIONAL_PREFIX + "01", REP)])
def test_missing_or_invalid_demo_ids_are_rejected(monkeypatch, capsys, student, rep):
    monkeypatch.setattr(seed.config, "DATABASE_URL", "postgresql://localhost/demo_test")
    monkeypatch.setenv("DEMO_STUDENT_SUB", student)
    monkeypatch.setenv("DEMO_REP_SUB", rep)
    assert seed.main(["--confirm-demo"]) == 1
    assert "distinct Auth0 demo user IDs" in capsys.readouterr().err


def test_seed_database():
    database_url = os.getenv("SEED_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("SEED_TEST_DATABASE_URL is required for the isolated TimescaleDB test")

    async def check():
        async with asyncpg.create_pool(database_url, min_size=1, max_size=2) as pool:
            async with pool.acquire() as connection:
                database = await connection.fetchval("SELECT current_database()")
                address = await connection.fetchval("SELECT inet_server_addr()")
                assert database.endswith("_test") and (address is None or address.is_loopback)
                assert not await connection.fetchval("""
                    SELECT EXISTS (
                        SELECT 1 FROM users UNION ALL SELECT 1 FROM courses
                        UNION ALL SELECT 1 FROM insights
                    )
                """), "Use an empty, disposable database with the schema applied"

                original_user = "auth0|unrelated-fixture"
                stamp = dt.datetime(2026, 9, 8, 18, tzinfo=seed.VANCOUVER)
                await connection.execute("INSERT INTO users (id, role) VALUES ($1, 'student')", original_user)
                unrelated = await connection.fetchval(
                    "INSERT INTO courses (code, name, term) VALUES ('CPSC 210', 'Other course', $1) RETURNING id",
                    seed.TERM,
                )
                await connection.execute("INSERT INTO enrollments VALUES ($1, $2)", original_user, unrelated)
                await connection.execute(
                    "INSERT INTO checkins (time, user_id, stress, raw_text) VALUES ($1, $2, 2, 'Unrelated fixture')",
                    stamp, original_user,
                )
                await connection.execute("INSERT INTO checkin_course VALUES ($1, $2, $3, 2)", stamp, unrelated, original_user)

                with pytest.raises(seed.SeedError, match="already has application data"):
                    await seed.seed_demo(connection, original_user, REP)
                assert await connection.fetchval("SELECT count(*) FROM users") == 1
                assert await connection.fetchval("SELECT count(*) FROM courses") == 1

                # The existing role must survive an incompatible mapping and rollback.
                with pytest.raises(seed.SeedError, match="different database role"):
                    await seed.seed_demo(connection, STUDENT, original_user)
                assert await connection.fetchval("SELECT count(*) FROM users") == 1

                async with pool.acquire() as second:
                    results = await asyncio.gather(
                        seed.seed_demo(connection, STUDENT, REP), seed.seed_demo(second, STUDENT, REP),
                    )
                assert results.count(None) == 1
                seeded_checkins = next(count for count in results if count is not None)
                assert seeded_checkins == len(seed.generate_checkins(seed.demo_enrollments(STUDENT)))
                assert await seed.seed_demo(connection, "auth0|different-student", "auth0|different-rep") is None
                assert await connection.fetchval("SELECT count(*) FROM users WHERE role = 'student'") == 41
                assert await connection.fetchval("SELECT count(*) FROM users WHERE role = 'rep'") == 1
                assert await connection.fetchval("SELECT count(*) FROM courses") == 5
                assert await connection.fetchval("SELECT count(*) FROM deadlines") == len(seed.ASSESSMENTS)
                assert await connection.fetchval("SELECT count(*) FROM checkins") == seeded_checkins + 1
                assert await connection.fetchval("SELECT raw_text FROM checkins WHERE user_id = $1", original_user) == "Unrelated fixture"
                assert await connection.fetchval("SELECT name FROM courses WHERE id = $1", unrelated) == "Other course"
                assert await connection.fetchval("SELECT count(*) FROM enrollments WHERE user_id = $1", STUDENT) == 2
                assignments = await connection.fetch("""
                    SELECT code FROM rep_assignments JOIN courses ON courses.id = course_id WHERE user_id = $1
                """, REP)
                assert {row["code"] for row in assignments} == {seed.FOCUS_COURSE, "DEMO MATH 200", "DEMO ENGL 110"}

                assert await connection.fetchval("""
                    SELECT count(*) FROM checkins AS ck JOIN enrollments AS e USING (user_id)
                    LEFT JOIN checkin_course AS cc
                        ON cc.time = ck.time AND cc.user_id = ck.user_id AND cc.course_id = e.course_id
                    WHERE cc.stress IS DISTINCT FROM ck.stress
                """) == 0
                assert await connection.fetchval("""
                    SELECT count(*) FROM checkin_course AS cc
                    LEFT JOIN checkins AS ck USING (user_id, time)
                    LEFT JOIN enrollments AS e USING (user_id, course_id)
                    WHERE ck.user_id IS NULL OR e.user_id IS NULL
                """) == 0
                with pytest.raises(asyncpg.ForeignKeyViolationError):
                    await connection.execute("INSERT INTO checkin_course VALUES ($1, -1, $2, 2)", stamp, STUDENT)

                await seed.refresh_demo_history(connection)
                visible = await connection.fetch("""
                    SELECT c.code, (day AT TIME ZONE 'America/Vancouver')::date AS date, avg_stress, n_students
                    FROM daily_course_stress JOIN courses AS c ON c.id = course_id
                    WHERE n_students >= $1 AND c.code LIKE 'DEMO %'
                """, seed.config.COHORT_MIN)
                assert {row["code"] for row in visible} == seed.COURSES.keys()
                assert all(row["date"] != seed.LOW_RESPONSE_DAY for row in visible)
                assert all("user_id" not in row.keys() and "raw_text" not in row.keys() for row in visible)
                focus_id = await connection.fetchval("SELECT id FROM courses WHERE code = $1", seed.FOCUS_COURSE)
                assert 0 < await connection.fetchval("""
                    SELECT n_students FROM daily_course_stress
                    WHERE course_id = $1 AND (day AT TIME ZONE 'America/Vancouver')::date = $2
                """, focus_id, seed.LOW_RESPONSE_DAY) < seed.config.COHORT_MIN
                deadlines = await connection.fetch("""
                    SELECT id, course_id, title, due_date, weight_pct, type FROM deadlines WHERE course_id = $1
                """, focus_id)
                [collision] = rep_collisions(
                    [Deadline.model_validate(dict(row)) for row in deadlines],
                    [(row["date"], float(row["avg_stress"])) for row in visible if row["code"] == seed.FOCUS_COURSE],
                )
                assert collision.deadline_count == 3 and collision.total_weight_pct == 55
                assert collision.peak_avg_stress > 5 and collision.peak_date is not None

    asyncio.run(check())
