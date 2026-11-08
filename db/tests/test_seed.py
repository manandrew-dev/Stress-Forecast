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
WEEK_9 = dt.date(2026, 11, 2)


def test_term_courses_and_enrollments():
    enrollments = seed.demo_enrollments(STUDENT)
    assert seed.TERM == "2026W1"
    assert len(enrollments) == 40
    assert sum(user_id.startswith(seed.FICTIONAL_PREFIX) for user_id in enrollments) == 39
    assert len(seed.COURSES) == 4
    assert all(len(codes) >= 2 and set(codes) <= seed.COURSES.keys() for codes in enrollments.values())
    counts = Counter(code for codes in enrollments.values() for code in codes)
    assert counts == {seed.FOCUS_COURSE: 25, seed.MATH_COURSE: 20, "DEMO PHYS 118": 25, "DEMO ENGL 110": 20}
    assert sum(counts.values()) == 90
    assert all(item.course in seed.COURSES for item in seed.ASSESSMENTS)


def test_reproducible_checkins_with_variation_and_leadup():
    enrollments = seed.demo_enrollments(STUDENT)
    rows = seed.generate_checkins(enrollments)
    assert rows == seed.generate_checkins(enrollments)
    assert len(rows) == 1992
    assert sum(len(enrollments[row.user_id]) for row in rows) == 4479
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


def test_week_nine_cross_course_fixture():
    enrollments = seed.demo_enrollments(STUDENT)
    cohort = [codes for codes in enrollments.values() if seed.FOCUS_COURSE in codes]
    overlap = Counter(code for codes in cohort for code in codes if code != seed.FOCUS_COURSE)
    shared = {code for code, size in overlap.items() if size >= seed.config.COHORT_MIN}
    assert overlap == {seed.MATH_COURSE: 10, "DEMO PHYS 118": 15, "DEMO ENGL 110": 10}
    course_ids = {code: index for index, code in enumerate(seed.COURSES, 1)}
    focus_id = course_ids[seed.FOCUS_COURSE]
    deadlines = [
        Deadline(
            id=index, course_id=course_ids[item.course], title=item.title, due_date=item.due_date,
            weight_pct=item.weight, type=item.kind,
        )
        for index, item in enumerate(seed.ASSESSMENTS, 1) if item.course in shared | {seed.FOCUS_COURSE}
    ]
    [collision] = [window for window in find_collisions(deadlines)
                   if WEEK_9 <= window.start < WEEK_9 + dt.timedelta(days=7)
                   and any(item.course_id == focus_id for item in window.deadlines)]
    assert (collision.start, collision.end) == (dt.date(2026, 11, 3), dt.date(2026, 11, 7))
    first_monday = seed.TERM_START - dt.timedelta(days=seed.TERM_START.weekday())
    assert 1 + (collision.start - first_monday).days // 7 == 9
    assert collision.deadline_count == 3 and collision.total_weight_pct == 55
    assert [(item.course_id, item.due_date.day, item.weight_pct) for item in collision.deadlines] == [
        (focus_id, 3, 20), (course_ids[seed.MATH_COURSE], 5, 25), (focus_id, 7, 10),
    ]
    assert not find_collisions([item for item in collision.deadlines if item.course_id == focus_id])
    affected = sum(bool(find_collisions([
        item for item in collision.deadlines if item.course_id in {course_ids[code] for code in codes}
    ])) for codes in cohort)
    assert (affected, len(cohort)) == (10, 25)
    assert affected >= seed.config.COHORT_MIN
    student_ids = {course_ids[code] for code in enrollments[STUDENT]}
    assert heads_up([item for item in deadlines if item.course_id in student_ids], seed.DEMO_DAY)[0].total_weight_pct == 55


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


def test_seed_database(monkeypatch):
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

                with pytest.raises(seed.SeedError, match="No existing demo fixture"):
                    await seed.seed_demo(connection, STUDENT, REP, upgrade=True)
                partial = connection.transaction()
                await partial.start()
                try:
                    await connection.execute(
                        "INSERT INTO courses (code, name, term) VALUES ($1, $2, $3)",
                        seed.FOCUS_COURSE, seed.COURSES[seed.FOCUS_COURSE], seed.TERM,
                    )
                    with pytest.raises(seed.SeedError, match="Reserved demo course codes conflict"):
                        await seed.seed_demo(connection, STUDENT, REP, upgrade=True)
                    assert await connection.fetchval("SELECT count(*) FROM courses") == 1
                    assert await connection.fetchval("SELECT count(*) FROM users") == 0
                finally:
                    await partial.rollback()

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

                with monkeypatch.context() as original:
                    original.setattr(seed, "ASSESSMENTS", seed._ORIGINAL_ASSESSMENTS)
                    async with pool.acquire() as second:
                        results = await asyncio.gather(
                            seed.seed_demo(connection, STUDENT, REP), seed.seed_demo(second, STUDENT, REP),
                        )
                assert results.count(None) == 1
                seeded_checkins = next(count for count in results if count is not None)
                assert seeded_checkins == 1992
                assert await seed.seed_demo(connection, "auth0|different-student", "auth0|different-rep") is None
                focus_id = await connection.fetchval("SELECT id FROM courses WHERE code = $1", seed.FOCUS_COURSE)
                math_id = await connection.fetchval("SELECT id FROM courses WHERE code = $1", seed.MATH_COURSE)
                project_date_sql = "SELECT due_date FROM deadlines WHERE course_id = $1 AND title = 'Project Phase 3'"
                assert await connection.fetchval(project_date_sql, focus_id) == dt.date(2026, 11, 5)
                with pytest.raises(seed.SeedError, match="accounts, enrollments, or rep assignments"):
                    await seed.seed_demo(connection, "auth0|different-student", REP, upgrade=True)

                partial = connection.transaction()
                await partial.start()
                try:
                    await connection.execute("""
                        UPDATE deadlines SET due_date = DATE '2026-11-19'
                        WHERE course_id = $1 AND title = 'Project Phase 3'
                    """, focus_id)
                    await connection.execute("""
                        UPDATE deadlines SET due_date = DATE '2026-11-05'
                        WHERE course_id = $1 AND title = 'Midterm 2'
                    """, math_id)
                    with pytest.raises(seed.SeedError, match="Demo check-ins differ"):
                        await seed.seed_demo(connection, STUDENT, REP, upgrade=True)
                finally:
                    await partial.rollback()

                enrollments = seed.demo_enrollments(STUDENT)
                history = seed.generate_checkins(enrollments)
                original_history = seed.generate_checkins(enrollments, seed._ORIGINAL_ASSESSMENTS)
                old, new = next((a, b) for a, b in reversed(list(zip(original_history, history, strict=True))) if a != b)
                update_text = "UPDATE checkins SET raw_text = $3 WHERE time = $1 AND user_id = $2"
                await connection.execute(update_text, old.time, old.user_id, "Edited demo check-in")
                with pytest.raises(seed.SeedError, match="Demo check-ins differ"):
                    await seed.seed_demo(connection, STUDENT, REP, upgrade=True)
                assert await connection.fetchval(project_date_sql, focus_id) == dt.date(2026, 11, 5)
                assert await connection.fetchval(
                    "SELECT raw_text FROM checkins WHERE time = $1 AND user_id = $2", old.time, old.user_id,
                ) == "Edited demo check-in"
                await connection.execute(update_text, old.time, old.user_id, old.raw_text)

                authored = await connection.fetchval("""
                    INSERT INTO deadlines (course_id, title, due_date, type, created_by)
                    VALUES ($1, 'Student copy', DATE '2026-11-20', 'other', $2) RETURNING id
                """, focus_id, STUDENT)
                live_stamp = dt.datetime.combine(seed.DEMO_DAY, dt.time(12), seed.VANCOUVER)
                await connection.execute("""
                    INSERT INTO checkins (time, user_id, stress, raw_text) VALUES ($1, $2, 9, 'Live demo')
                """, live_stamp, STUDENT)
                await connection.executemany(
                    "INSERT INTO checkin_course VALUES ($1, $2, $3, 9)",
                    [(live_stamp, course_id, STUDENT) for course_id in (focus_id, math_id)],
                )
                await seed.refresh_demo_history(connection)
                async with pool.acquire() as second:
                    updates = await asyncio.gather(
                        seed.seed_demo(connection, STUDENT, REP, upgrade=True),
                        seed.seed_demo(second, STUDENT, REP, upgrade=True),
                    )
                assert updates.count(None) == 1 and 77 in updates
                assert await seed.seed_demo(connection, STUDENT, REP, upgrade=True) is None
                assert await connection.fetchval(project_date_sql, focus_id) == dt.date(2026, 11, 19)
                assert await connection.fetchval(
                    "SELECT due_date FROM deadlines WHERE course_id = $1 AND title = 'Midterm 2'", math_id,
                ) == dt.date(2026, 11, 5)
                assert await connection.fetchval("SELECT title FROM deadlines WHERE id = $1", authored) == "Student copy"
                assert await connection.fetchval(
                    "SELECT raw_text FROM checkins WHERE time = $1 AND user_id = $2", live_stamp, STUDENT,
                ) == "Live demo"
                assert await connection.fetchval("SELECT count(*) FROM checkin_course WHERE time = $1", live_stamp) == 2
                stored = await connection.fetch("""
                    SELECT time, user_id, stress, sleep_hours::float8, causes, raw_text FROM checkins
                    WHERE user_id = ANY($1::text[]) AND time < $2
                """, list(enrollments), live_stamp)
                assert {
                    seed.Checkin(time, user_id, stress, sleep, tuple(causes), text)
                    for time, user_id, stress, sleep, causes, text in stored
                } == set(history)
                assert await connection.fetchval("SELECT count(*) FROM users WHERE role = 'student'") == 41
                assert await connection.fetchval("SELECT count(*) FROM users WHERE role = 'rep'") == 1
                assert await connection.fetchval("SELECT count(*) FROM courses") == 5
                assert await connection.fetchval("SELECT count(*) FROM deadlines") == 19
                assert await connection.fetchval("SELECT count(*) FROM checkins") == seeded_checkins + 2
                assert await connection.fetchval("SELECT count(*) FROM checkin_course") == 4482
                assert await connection.fetchval("SELECT count(*) FROM enrollments") == 91
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
                assert Counter(row["code"] for row in visible) == dict.fromkeys(seed.COURSES, 59)
                assert 0 < await connection.fetchval("""
                    SELECT n_students FROM daily_course_stress
                    WHERE course_id = $1 AND (day AT TIME ZONE 'America/Vancouver')::date = $2
                """, focus_id, seed.LOW_RESPONSE_DAY) < seed.config.COHORT_MIN
                deadlines = await connection.fetch("""
                    SELECT id, course_id, title, due_date, weight_pct, type FROM deadlines
                    WHERE course_id = ANY($1::int[]) AND created_by IS NULL
                """, [focus_id, math_id])
                collisions = rep_collisions(
                    [Deadline.model_validate(dict(row)) for row in deadlines],
                    [(row["date"], float(row["avg_stress"])) for row in visible if row["code"] == seed.FOCUS_COURSE],
                )
                [collision] = [item for item in collisions if item.start == dt.date(2026, 11, 3)]
                assert collision.deadline_count == 3 and collision.total_weight_pct == 55
                assert collision.peak_avg_stress > 5 and collision.peak_date is not None
                assert {item.course_id for item in collision.deadlines} == {focus_id, math_id}
                cohort = await connection.fetch("""
                    SELECT array_agg(course_id) AS course_ids FROM enrollments
                    WHERE user_id IN (SELECT user_id FROM enrollments WHERE course_id = $1)
                    GROUP BY user_id
                """, focus_id)
                affected = sum(bool(find_collisions([
                    item for item in collision.deadlines if item.course_id in row["course_ids"]
                ])) for row in cohort)
                assert (affected, len(cohort)) == (10, 25)
                assert await connection.fetchval("""
                    SELECT avg_stress = (
                        SELECT avg(stress)::numeric(4, 2) FROM checkin_course
                        WHERE course_id = $1 AND time >= $2 AND time < $3
                    ) FROM daily_course_stress WHERE course_id = $1 AND day = $2
                """, focus_id, dt.datetime(2026, 11, 4, tzinfo=seed.VANCOUVER),
                    dt.datetime(2026, 11, 5, tzinfo=seed.VANCOUVER))

    asyncio.run(check())
