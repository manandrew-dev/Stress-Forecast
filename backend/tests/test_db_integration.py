"""End-to-end checks of #16/#17 against a seeded database (db/seed.py).

Skipped unless INTEGRATION_DATABASE_URL is set. Every test runs inside one outer
transaction that is always rolled back (the app's own transactions become savepoints),
so it is safe to point at the shared demo database. Gemini is mocked.
"""

import asyncio
import datetime as dt
import os
from contextlib import asynccontextmanager

import asyncpg
import httpx
import pytest
from fastapi import FastAPI

from app import auth, localtime
from app.main import api
from app.models import DeadlineInput
from app.routers import courses, rep, student
from app.services import gemini

URL = os.getenv("INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="set INTEGRATION_DATABASE_URL to a seeded database")

FOCUS = "DEMO CPSC 210"
DEMO_NOW = dt.datetime(2026, 11, 7, 12, 0, tzinfo=localtime.TZ)
COUNTED_TABLES = ("users", "enrollments", "deadlines", "checkins", "checkin_course", "insights")


class TxPool:
    """Pool stand-in that routes everything through one connection in an open transaction."""

    def __init__(self, conn):
        self.conn = conn

    def __getattr__(self, name):  # fetch, fetchrow, fetchval, execute, executemany
        return getattr(self.conn, name)

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


async def _counts(conn):
    return {t: await conn.fetchval(f"SELECT count(*) FROM {t}") for t in COUNTED_TABLES}


@asynccontextmanager
async def harness():
    conn = await asyncpg.connect(URL, timeout=20)
    tx = conn.transaction()
    await tx.start()
    try:
        app = FastAPI(exception_handlers=api.exception_handlers)
        app.state.db_pool = TxPool(conn)
        for r in (courses.router, student.router, rep.router):
            app.include_router(r, prefix="/api")
        ids = {
            row["role"]: row["id"]
            for row in await conn.fetch(
                "SELECT id, role FROM users WHERE id NOT LIKE 'stressforecast-demo:%'"
            )
        }
        focus_id = await conn.fetchval("SELECT id FROM courses WHERE code = $1", FOCUS)

        def client(role):
            app.dependency_overrides[auth._verified_user] = lambda: auth.AuthenticatedUser(ids[role], role)
            return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

        yield client, conn, focus_id
    finally:
        await tx.rollback()
        await conn.close()


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def mocked(monkeypatch):
    monkeypatch.setattr(localtime, "now", lambda: DEMO_NOW)
    monkeypatch.setattr(localtime, "today", lambda: DEMO_NOW.date())
    rep._report_cache.clear()

    async def parse(text):
        return gemini.ParsedCheckin(stress=9, sleep_hours=5, causes=["exam prep"], concerning=False)

    async def extract(text, today=None):
        return [DeadlineInput(title="Midterm 2", due_date=dt.date(2026, 11, 3), weight_pct=20, type="midterm")]

    calls = []

    async def report(course, aggregates, deadlines, flagged, week_start):
        calls.append({"aggregates": aggregates, "flagged": flagged, "deadlines": deadlines})
        return gemini.WeeklyReport(summary="s", top_cause="overlapping deadlines", suggested_fix="f")

    monkeypatch.setattr(gemini, "parse_checkin", parse)
    monkeypatch.setattr(gemini, "extract_deadlines", extract)
    monkeypatch.setattr(gemini, "weekly_report", report)
    return calls


def test_database_is_left_unchanged():
    async def go():
        conn = await asyncpg.connect(URL, timeout=20)
        before = await _counts(conn)
        await conn.close()
        async with harness() as (client, _conn, focus):
            async with client("student") as c:
                assert (await c.post("/api/checkins", json={"text": "busy"})).status_code == 200
                await c.post("/api/deadlines", json={"course_id": focus, "deadlines": []})
        conn = await asyncpg.connect(URL, timeout=20)
        after = await _counts(conn)
        await conn.close()
        assert after == before

    run(go())


def test_me_and_courses():
    async def go():
        async with harness() as (client, _conn, focus):
            async with client("student") as c:
                me = (await c.get("/api/me")).json()
                assert me["role"] == "student" and any(x["id"] == focus for x in me["courses"])
                assert len((await c.get("/api/courses")).json()["courses"]) == 4
            async with client("rep") as c:
                me = (await c.get("/api/me")).json()
                assert me["role"] == "rep" and {x["code"] for x in me["courses"]} == {
                    "DEMO CPSC 210", "DEMO MATH 200", "DEMO ENGL 110"}

    run(go())


def test_trend_and_heads_up():
    async def go():
        async with harness() as (client, _conn, focus):
            async with client("student") as c:
                trend = (await c.get("/api/me/trend")).json()
                dates = [p["date"] for p in trend["points"]]
                assert dates and dates == sorted(dates) and len(dates) == len(set(dates))
                assert "2026-09-08" <= dates[0] and dates[-1] <= "2026-11-07"
                assert {"Midterm 2", "Project Phase 3", "Quiz 4"} <= {d["title"] for d in trend["deadlines"]}

                ranged = (await c.get("/api/me/trend?from=2026-11-01&to=2026-11-05")).json()
                assert all("2026-11-01" <= p["date"] <= "2026-11-05" for p in ranged["points"])

                heads = (await c.get("/api/me/heads-up")).json()["collisions"]
                week9 = [x for x in heads if x["start"] == "2026-11-03"]
                assert week9 and week9[0]["deadline_count"] == 3 and week9[0]["total_weight_pct"] == 55

    run(go())


def test_cohort_privacy_and_access():
    async def go():
        async with harness() as (client, _conn, focus):
            async with client("rep") as c:
                body = (await c.get(f"/api/courses/{focus}/cohort")).json()
                days = {d["date"]: d for d in body["days"]}
                assert body["min_students"] == 5
                assert days["2026-09-13"] == {"date": "2026-09-13", "avg_stress": None,
                                              "n_students": None, "suppressed": True}
                visible = [d for d in body["days"] if not d["suppressed"]]
                assert visible and all(d["n_students"] >= 5 for d in visible)
                assert body["days"][-1]["date"] == "2026-11-07"
                assert "auth0|" not in str(body) and "stressforecast-demo" not in str(body)

                phys = await conn_course(c, "DEMO PHYS 118", _conn)
                r = await c.get(f"/api/courses/{phys}/cohort")
                assert r.status_code == 403
            async with client("student") as c:
                assert (await c.get(f"/api/courses/{focus}/cohort")).status_code == 403

    run(go())


async def conn_course(_client, code, conn):
    return await conn.fetchval("SELECT id FROM courses WHERE code = $1", code)


def test_collisions_report_insights(mocked):
    async def go():
        async with harness() as (client, _conn, focus):
            async with client("rep") as c:
                cols = (await c.get(f"/api/courses/{focus}/collisions")).json()["collisions"]
                # The current rep endpoint still uses only the focus course's deadlines.
                # Week 9 needs MATH 200 to qualify under the merged cross-course design.
                assert not any(x["start"] == "2026-11-03" for x in cols)

                rep_body = (await c.get(f"/api/courses/{focus}/report?week_start=2026-11-04")).json()
                assert rep_body["week_start"] == "2026-11-02" and rep_body["top_cause"] == "overlapping deadlines"
                [call] = mocked
                assert call["aggregates"] and all(len(p) == 2 for p in call["aggregates"])
                assert all("2026-10-26" <= p[0].isoformat() <= "2026-11-08" for p in call["aggregates"])

                # Rows written by the Databricks notebook, if it has run; newest week first, no ids.
                insights = (await c.get(f"/api/courses/{focus}/insights")).json()["insights"]
                expected = await _conn.fetchval("SELECT count(*) FROM insights WHERE course_id = $1", focus)
                assert len(insights) == expected
                assert all(set(i) == {"week_start", "finding"} and i["finding"] for i in insights)
                weeks = [i["week_start"] for i in insights]
                assert weeks == sorted(weeks, reverse=True)

    run(go())


def test_checkin_replace_and_fan_out():
    async def go():
        async with harness() as (client, conn, focus):
            async with client("student") as c:
                first = (await c.post("/api/checkins", json={"text": "exam tomorrow"})).json()
                assert first["replaced_earlier"] is False
                assert first["time"] == DEMO_NOW.isoformat()
                second = (await c.post("/api/checkins", json={"text": "still studying"})).json()
                assert second["replaced_earlier"] is True

                me = (await c.get("/api/me")).json()
                uid = me["id"]
                start, end = localtime.day_bounds(DEMO_NOW.date())
                assert await conn.fetchval(
                    "SELECT count(*) FROM checkins WHERE user_id = $1 AND time >= $2 AND time < $3", uid, start, end
                ) == 1
                assert await conn.fetchval(
                    "SELECT count(*) FROM checkin_course WHERE user_id = $1 AND time >= $2 AND time < $3",
                    uid, start, end,
                ) == len(me["courses"])
                assert await conn.fetchval(
                    "SELECT raw_text FROM checkins WHERE user_id = $1 AND time >= $2", uid, start
                ) == "still studying"

                trend = (await c.get("/api/me/trend")).json()
                assert trend["points"][-1] == {"date": "2026-11-07", "stress": 9, "sleep_hours": 5.0}

    run(go())


def test_deadlines_dedupe_and_ownership():
    async def go():
        async with harness() as (client, conn, focus):
            async with client("student") as c:
                r = await c.post("/api/syllabus", json={"course_id": focus, "text": "Midterm 2: Nov 3 (20%)"})
                assert r.status_code == 200 and r.json()["deadlines"][0]["title"] == "Midterm 2"

                saved = (await c.post("/api/deadlines", json={"course_id": focus, "deadlines": [
                    {"title": "midterm 2 ", "due_date": "2026-11-03", "weight_pct": 20, "type": "midterm"},
                    {"title": "Study group", "due_date": "2026-11-20", "weight_pct": None, "type": "other"},
                ]})).json()["deadlines"]
                own_id = saved[1]["id"]

                # The student's copy of Midterm 2 must not double-count in the week 9 collision.
                heads = (await c.get("/api/me/heads-up")).json()["collisions"]
                week9 = [x for x in heads if x["start"] == "2026-11-03"][0]
                assert week9["deadline_count"] == 3 and week9["total_weight_pct"] == 55
                titles = [d["title"] for d in (await c.get("/api/me/trend")).json()["deadlines"]]
                assert sum(t.strip().lower() == "midterm 2" for t in titles if t) >= 1
                assert "Study group" in titles

                upd = await c.put(f"/api/deadlines/{own_id}", json={
                    "title": "Study group", "due_date": "2026-11-21", "weight_pct": None, "type": "other"})
                assert upd.status_code == 200 and upd.json()["due_date"] == "2026-11-21"

                official = await conn.fetchval(
                    "SELECT id FROM deadlines WHERE created_by IS NULL AND course_id = $1 LIMIT 1", focus)
                assert (await c.put(f"/api/deadlines/{official}", json={
                    "title": "x", "due_date": "2026-11-21", "weight_pct": 1, "type": "quiz"})).status_code == 403
                assert (await c.delete(f"/api/deadlines/{own_id}")).status_code == 204
                assert (await c.delete(f"/api/deadlines/{own_id}")).status_code == 404

            async with client("rep") as c:
                deadlines = (await c.get(f"/api/courses/{focus}/cohort")).json()["deadlines"]
                [midterm] = [d for d in deadlines if d["course_id"] == focus and d["due_date"] == "2026-11-03"]
                assert (midterm["title"], midterm["weight_pct"]) == ("Midterm 2", 20)

    run(go())


def test_enrollment_rules():
    async def go():
        async with harness() as (client, conn, focus):
            async with client("student") as c:
                phys = await conn.fetchval("SELECT id FROM courses WHERE code = 'DEMO PHYS 118'")
                enrolled = {x["id"] for x in (await c.get("/api/me")).json()["courses"]}
                other = phys if phys not in enrolled else next(
                    i for i in (await c.get("/api/courses")).json()["courses"] if i["id"] not in enrolled)["id"]
                r = await c.post("/api/deadlines", json={"course_id": other, "deadlines": []})
                assert r.status_code == 403

                assert (await c.put("/api/me/courses", json={"course_ids": [focus, other]})).status_code == 204
                assert {x["id"] for x in (await c.get("/api/me")).json()["courses"]} == {focus, other}
                assert (await c.put("/api/me/courses", json={"course_ids": [999999]})).status_code == 400

    run(go())
