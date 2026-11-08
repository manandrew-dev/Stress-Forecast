"""Cohort service and rep endpoints (#17) with a fake database and mocked Gemini."""

import datetime as dt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import auth, localtime
from app.main import api
from app.routers import courses, rep, student
from app.services import gemini
from fakedb import FakeDB

REP = auth.AuthenticatedUser("auth0|rep", "rep")
STUDENT = auth.AuthenticatedUser("auth0|student", "student")
CPSC = {"id": 1, "code": "DEMO CPSC 210", "name": "Software Construction", "term": "2026W1"}
TODAY = dt.date(2026, 11, 7)


def day(d, avg, n):
    return {"date": dt.date.fromisoformat(d), "avg_stress": avg, "n_students": n}


def deadline_row(i, title, due, weight):
    return {"id": i, "course_id": 1, "title": title, "due_date": dt.date.fromisoformat(due),
            "weight_pct": weight, "type": "midterm"}


WEEK9 = [
    deadline_row(1, "Midterm 2", "2026-11-03", 20),
    deadline_row(2, "Project Phase 3", "2026-11-05", 25),
    deadline_row(3, "Quiz 4", "2026-11-07", 10),
]


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr(localtime, "today", lambda: TODAY)
    rep._report_cache.clear()
    fake = FakeDB()
    fake.on("FROM rep_assignments WHERE user_id", True)
    fake.on("FROM courses WHERE id = ANY", [{"id": 1, "code": "DEMO CPSC 210"}, {"id": 2, "code": "DEMO MATH 200"}])
    fake.on("FROM courses WHERE id", CPSC)
    # Anonymous course sets: 6 students take only CPSC (course 1).
    fake.on("array_agg(e.course_id", [{"course_ids": [1]}] * 6)
    return fake


@pytest.fixture
def as_user(db):
    app = FastAPI(exception_handlers=api.exception_handlers)
    app.state.db_pool = db
    for r in (courses.router, student.router, rep.router):
        app.include_router(r, prefix="/api")

    def login(user):
        app.dependency_overrides[auth._verified_user] = lambda: user
        return TestClient(app)

    return login


def check_error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code


def test_unassigned_rep_gets_403(as_user, db):
    db.rules.insert(0, ("FROM rep_assignments WHERE user_id", False))
    check_error(as_user(REP).get("/api/courses/1/cohort"), 403, "forbidden")


def test_student_gets_403(as_user):
    check_error(as_user(STUDENT).get("/api/courses/1/collisions"), 403, "forbidden")


def test_cohort_fills_suppressed_days_and_filters_in_sql(as_user, db):
    db.on("FROM daily_course_stress", [day("2026-11-05", 7.4, 31), day("2026-11-07", 8.1, 12)])
    db.on("(created_by IS NULL) DESC", WEEK9)
    r = as_user(REP).get("/api/courses/1/cohort")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["course"] == CPSC and body["min_students"] == 5
    assert body["days"] == [
        {"date": "2026-11-05", "avg_stress": 7.4, "n_students": 31, "suppressed": False},
        {"date": "2026-11-06", "avg_stress": None, "n_students": None, "suppressed": True},
        {"date": "2026-11-07", "avg_stress": 8.1, "n_students": 12, "suppressed": False},
    ]
    assert len(body["deadlines"]) == 3
    # The 5-student filter is a SQL parameter, so suppressed values are never fetched.
    assert db.sql("FROM daily_course_stress")[0][1] == 5
    assert "auth0|" not in r.text


def test_cohort_with_range(as_user, db):
    db.on("FROM daily_course_stress", [day("2026-11-03", 6.0, 20)])
    db.on("(created_by IS NULL) DESC", WEEK9)
    body = as_user(REP).get("/api/courses/1/cohort?from=2026-11-02&to=2026-11-04").json()
    assert [d["date"] for d in body["days"]] == ["2026-11-02", "2026-11-03", "2026-11-04"]
    assert [d["suppressed"] for d in body["days"]] == [True, False, True]
    assert [d["title"] for d in body["deadlines"]] == ["Midterm 2"]


def test_cohort_without_any_data(as_user, db):
    body = as_user(REP).get("/api/courses/1/cohort").json()
    assert body["days"] == [{"date": "2026-11-07", "avg_stress": None, "n_students": None, "suppressed": True}]


@pytest.mark.parametrize("query", ["from=2026-11-08&to=2026-11-01", "from=2024-01-01&to=2026-11-01", "to=nope"])
def test_cohort_bad_range(as_user, db, query):
    check_error(as_user(REP).get(f"/api/courses/1/cohort?{query}"), 400, "bad_request")


def test_collisions_with_peak(as_user, db):
    db.on("(created_by IS NULL) DESC", WEEK9)
    db.on("FROM daily_course_stress", [day("2026-10-30", 9.9, 30), day("2026-11-02", 8.1, 30), day("2026-11-04", 7.0, 30)])
    body = as_user(REP).get("/api/courses/1/collisions").json()
    assert body["cohort_size"] == 6
    [c] = body["collisions"]
    assert (c["start"], c["end"], c["deadline_count"], c["total_weight_pct"]) == ("2026-11-03", "2026-11-07", 3, 55.0)
    assert c["students_affected"] == 6  # a single-course pile-up affects the whole class
    assert (c["peak_avg_stress"], c["peak_date"]) == (8.1, "2026-11-02")  # Oct 30 is outside the lookback


# Class of course 1: 6 also take course 2, 4 also take course 3 (not shared: under COHORT_MIN).
CROSS_STUDENTS = [{"course_ids": [1, 2]}] * 6 + [{"course_ids": [1, 3]}] * 4
CROSS_DEADLINES = [
    deadline_row(1, "Midterm 2", "2026-11-03", 20),
    {**deadline_row(2, "Midterm 2", "2026-11-05", 25), "course_id": 2},
    {**deadline_row(3, "Final", "2026-11-04", 50), "course_id": 3},
]


def _deadlines_for(course_ids):
    return [r for r in CROSS_DEADLINES if r["course_id"] in course_ids]


def test_collisions_across_shared_courses(as_user, db):
    db.rules = [r for r in db.rules if r[0] != "array_agg(e.course_id"]
    db.on("array_agg(e.course_id", CROSS_STUDENTS)
    db.on("(created_by IS NULL) DESC", _deadlines_for)
    r = as_user(REP).get("/api/courses/1/collisions")
    body = r.json()
    assert body["cohort_size"] == 10
    [c] = body["collisions"]
    assert [(d["course_id"], d["due_date"]) for d in c["deadlines"]] == [(1, "2026-11-03"), (2, "2026-11-05")]
    assert (c["total_weight_pct"], c["students_affected"]) == (45.0, 6)
    # Course 3 isn't shared, so its deadlines weren't even fetched.
    assert db.sql("(created_by IS NULL) DESC")[0][0] == [1, 2]
    assert "auth0|" not in r.text and "user_id" not in r.text


def test_cohort_includes_shared_course_deadlines(as_user, db):
    db.rules = [r for r in db.rules if r[0] != "array_agg(e.course_id"]
    db.on("array_agg(e.course_id", CROSS_STUDENTS)
    db.on("(created_by IS NULL) DESC", _deadlines_for)
    r = as_user(REP).get("/api/courses/1/cohort")
    assert sorted({d["course_id"] for d in r.json()["deadlines"]}) == [1, 2]
    assert "auth0|" not in r.text and "user_id" not in r.text


def test_enrollment_query_never_selects_user_ids():
    from app.services import cohort as cohort_service

    sql = " ".join(cohort_service._COURSE_SETS_SQL.split()).lower()
    select_list = sql.split(" from ")[0]
    assert "user_id" not in select_list and "array_agg(e.course_id" in select_list


@pytest.fixture
def fake_report(monkeypatch):
    calls = []

    async def report(course, aggregates, deadlines, flagged, week_start, course_codes=None):
        calls.append({"aggregates": aggregates, "week_start": week_start, "flagged": flagged,
                      "deadlines": deadlines, "course_codes": course_codes})
        return gemini.WeeklyReport(summary="s", top_cause="overlapping deadlines", suggested_fix="f")

    monkeypatch.setattr(gemini, "weekly_report", report)
    return calls


def test_report_is_built_from_aggregates_and_cached(as_user, db, fake_report):
    db.on("FROM daily_course_stress", [day("2026-10-28", 5.0, 30), day("2026-11-04", 7.5, 30)])
    db.on("(created_by IS NULL) DESC", WEEK9)
    client = as_user(REP)
    r = client.get("/api/courses/1/report?week_start=2026-11-04")  # a Wednesday
    assert r.status_code == 200, r.text
    assert r.json() == {"week_start": "2026-11-02", "summary": "s",
                        "top_cause": "overlapping deadlines", "suggested_fix": "f"}
    [call] = fake_report
    assert call["week_start"] == dt.date(2026, 11, 2)
    assert all(isinstance(p, tuple) and len(p) == 2 for p in call["aggregates"])  # (date, avg) only
    assert len(call["flagged"]) == 1

    assert client.get("/api/courses/1/report?week_start=2026-11-02").status_code == 200
    assert len(fake_report) == 1  # served from cache


def test_report_gets_cross_course_collisions_and_codes(as_user, db, fake_report):
    db.rules = [r for r in db.rules if r[0] != "array_agg(e.course_id"]
    db.on("array_agg(e.course_id", CROSS_STUDENTS)
    db.on("(created_by IS NULL) DESC", _deadlines_for)
    db.on("FROM daily_course_stress", [day("2026-11-04", 7.5, 30)])
    assert as_user(REP).get("/api/courses/1/report?week_start=2026-11-02").status_code == 200
    [call] = fake_report
    assert {d.course_id for d in call["deadlines"]} == {1, 2}
    [flagged] = call["flagged"]
    assert flagged.students_affected == 6 and {d.course_id for d in flagged.deadlines} == {1, 2}
    assert call["course_codes"] == {1: "DEMO CPSC 210", 2: "DEMO MATH 200"}


def test_report_defaults_to_current_week(as_user, db, fake_report):
    db.on("FROM daily_course_stress", [day("2026-11-03", 7.0, 30)])
    assert as_user(REP).get("/api/courses/1/report").json()["week_start"] == "2026-11-02"


def test_report_without_visible_days_skips_gemini(as_user, db, fake_report):
    db.on("FROM daily_course_stress", [day("2026-10-28", 5.0, 30)])  # only the previous week
    body = as_user(REP).get("/api/courses/1/report?week_start=2026-11-02").json()
    assert body["top_cause"] == "not enough data"
    assert fake_report == []


def test_report_ai_failure_is_422(as_user, db, monkeypatch):
    async def broken(*args, **kwargs):
        raise gemini.AIParseError("bad")

    monkeypatch.setattr(gemini, "weekly_report", broken)
    db.on("FROM daily_course_stress", [day("2026-11-03", 7.0, 30)])
    check_error(as_user(REP).get("/api/courses/1/report"), 422, "ai_parse_failed")
    assert rep._report_cache == {}  # failures aren't cached


def test_insights(as_user, db):
    db.on("FROM insights", [{"week_start": dt.date(2026, 11, 2), "finding": "Weeks with 40%+ ..."}])
    assert as_user(REP).get("/api/courses/1/insights").json() == {
        "insights": [{"week_start": "2026-11-02", "finding": "Weeks with 40%+ ..."}]}
