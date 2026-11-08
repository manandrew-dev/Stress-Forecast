"""Shared (#16) and student endpoints with a fake database and mocked Gemini."""

import datetime as dt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import auth, localtime
from app.main import api
from app.models import DeadlineInput
from app.routers import courses, rep, student
from app.services import gemini
from fakedb import FakeDB

STUDENT = auth.AuthenticatedUser("auth0|student", "student")
REP = auth.AuthenticatedUser("auth0|rep", "rep")
CPSC = {"id": 1, "code": "DEMO CPSC 210", "name": "Software Construction", "term": "2026W1"}


def deadline_row(i, title, due, weight=10, course_id=1, kind="assignment"):
    return {"id": i, "course_id": course_id, "title": title, "due_date": dt.date.fromisoformat(due),
            "weight_pct": weight, "type": kind}


@pytest.fixture
def db():
    return FakeDB()


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


def enrolled(db, course_exists=True, is_enrolled=True):
    db.on("AS course_exists", {"course_exists": course_exists, "enrolled": is_enrolled})


def check_error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code


# --- shared ---


def test_me_student_lists_enrollments(as_user, db):
    db.on("FROM enrollments AS link", [CPSC])
    body = as_user(STUDENT).get("/api/me").json()
    assert body == {"id": STUDENT.id, "role": "student", "courses": [CPSC]}
    assert db.sql("INSERT INTO users")  # user synchronised on first call


def test_me_rep_lists_assignments(as_user, db):
    db.on("FROM rep_assignments AS link", [CPSC])
    body = as_user(REP).get("/api/me").json()
    assert body["role"] == "rep" and body["courses"] == [CPSC]
    assert not db.sql("FROM enrollments AS link")


def test_courses(as_user, db):
    db.on("FROM courses ORDER BY", [CPSC])
    assert as_user(REP).get("/api/courses").json() == {"courses": [CPSC]}


def test_rep_cannot_use_student_endpoints(as_user):
    check_error(as_user(REP).post("/api/checkins", json={"text": "hi"}), 403, "forbidden")


# --- enrollments ---


def test_put_courses_replaces_enrollments(as_user, db):
    db.on("SELECT count(*) FROM courses", 2)
    r = as_user(STUDENT).put("/api/me/courses", json={"course_ids": [2, 1, 2]})
    assert r.status_code == 204 and r.content == b""
    assert db.sql("DELETE FROM enrollments") == [(STUDENT.id,)]
    assert db.sql("INSERT INTO enrollments") == [(STUDENT.id, 1), (STUDENT.id, 2)]


def test_put_courses_unknown_id(as_user, db):
    db.on("SELECT count(*) FROM courses", 1)
    check_error(as_user(STUDENT).put("/api/me/courses", json={"course_ids": [1, 99]}), 400, "bad_request")
    assert not db.sql("DELETE FROM enrollments")


# --- syllabus ---


@pytest.fixture
def fake_extract(monkeypatch):
    seen = {}

    async def extract(text, today=None):
        seen["text"], seen["today"] = text, today
        return [DeadlineInput(title="Midterm 1", due_date=dt.date(2026, 10, 14), weight_pct=20, type="midterm")]

    monkeypatch.setattr(gemini, "extract_deadlines", extract)
    return seen


def test_syllabus_json(as_user, db, fake_extract):
    enrolled(db)
    r = as_user(STUDENT).post("/api/syllabus", json={"course_id": 1, "text": "  Midterm 1: Oct 14 (20%) "})
    assert r.status_code == 200, r.text
    assert r.json() == {"course_id": 1, "deadlines": [
        {"title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20.0, "type": "midterm"}]}
    assert fake_extract["text"] == "Midterm 1: Oct 14 (20%)"
    assert not db.sql("INSERT INTO deadlines")  # extraction never saves


def minimal_pdf(text: str) -> bytes:
    stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n" % len(stream) + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def test_syllabus_pdf_upload(as_user, db, fake_extract):
    enrolled(db)
    files = {"file": ("syllabus.pdf", minimal_pdf("Midterm 1: Oct 14 (20%)"), "application/pdf")}
    r = as_user(STUDENT).post("/api/syllabus", data={"course_id": "1"}, files=files)
    assert r.status_code == 200, r.text
    assert "Midterm 1: Oct 14" in fake_extract["text"]


def test_syllabus_pdf_without_text_is_400(as_user, db, fake_extract):
    enrolled(db)
    files = {"file": ("scan.pdf", b"not really a pdf", "application/pdf")}
    check_error(as_user(STUDENT).post("/api/syllabus", data={"course_id": "1"}, files=files), 400, "bad_request")
    assert "text" not in fake_extract


def test_syllabus_requires_enrollment(as_user, db, fake_extract):
    enrolled(db, is_enrolled=False)
    check_error(as_user(STUDENT).post("/api/syllabus", json={"course_id": 1, "text": "x"}), 403, "forbidden")
    assert "text" not in fake_extract  # Gemini not called


def test_syllabus_unknown_course(as_user, db, fake_extract):
    enrolled(db, course_exists=False, is_enrolled=False)
    check_error(as_user(STUDENT).post("/api/syllabus", json={"course_id": 9, "text": "x"}), 404, "not_found")


def test_syllabus_bad_body(as_user, db):
    check_error(as_user(STUDENT).post("/api/syllabus", json={"text": "no course"}), 400, "bad_request")


def test_ai_parse_error_maps_to_422(as_user, db, monkeypatch):
    enrolled(db)

    async def broken(text, today=None):
        raise gemini.AIParseError("bad json twice")

    monkeypatch.setattr(gemini, "extract_deadlines", broken)
    check_error(as_user(STUDENT).post("/api/syllabus", json={"course_id": 1, "text": "x"}), 422, "ai_parse_failed")


# --- deadlines ---


def test_save_deadlines_replaces_own_copies(as_user, db):
    enrolled(db)
    db.on("INSERT INTO deadlines", lambda cid, title, due, w, kind, by: {
        "id": 40, "course_id": cid, "title": title, "due_date": due, "weight_pct": w, "type": kind})
    body = {"course_id": 1, "deadlines": [
        {"title": " Midterm 1 ", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm"}]}
    r = as_user(STUDENT).post("/api/deadlines", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["deadlines"][0] == {"id": 40, "course_id": 1, "title": "Midterm 1",
                                        "due_date": "2026-10-14", "weight_pct": 20.0, "type": "midterm"}
    assert db.sql("DELETE FROM deadlines WHERE course_id") == [(1, STUDENT.id)]
    assert db.sql("INSERT INTO deadlines")[0][-1] == STUDENT.id


@pytest.mark.parametrize("bad", [{"weight_pct": 150}, {"weight_pct": -1}, {"title": "  "}])
def test_save_deadlines_validation(as_user, db, bad):
    enrolled(db)
    d = {"title": "Quiz", "due_date": "2026-10-14", "weight_pct": 5, "type": "quiz"} | bad
    check_error(as_user(STUDENT).post("/api/deadlines", json={"course_id": 1, "deadlines": [d]}), 400, "bad_request")


def test_update_deadline_of_someone_else(as_user, db):
    db.on("SELECT created_by FROM deadlines", {"created_by": None})  # official seeded row
    body = {"title": "X", "due_date": "2026-10-14", "weight_pct": 5, "type": "quiz"}
    check_error(as_user(STUDENT).put("/api/deadlines/7", json=body), 403, "forbidden")


def test_update_missing_deadline(as_user, db):
    body = {"title": "X", "due_date": "2026-10-14", "weight_pct": 5, "type": "quiz"}
    check_error(as_user(STUDENT).put("/api/deadlines/7", json=body), 404, "not_found")


def test_update_own_deadline(as_user, db):
    db.on("UPDATE deadlines", deadline_row(7, "X", "2026-10-15", 5, kind="quiz"))
    body = {"title": "X", "due_date": "2026-10-15", "weight_pct": 5, "type": "quiz"}
    r = as_user(STUDENT).put("/api/deadlines/7", json=body)
    assert r.status_code == 200 and r.json()["due_date"] == "2026-10-15"


def test_delete_own_deadline(as_user, db):
    db.on("DELETE FROM deadlines WHERE id", 1)
    assert as_user(STUDENT).delete("/api/deadlines/7").status_code == 204


# --- check-ins ---


@pytest.fixture
def fake_parse(monkeypatch):
    seen = {}

    async def parse(text):
        seen["text"] = text
        return gemini.ParsedCheckin(stress=8, sleep_hours=4, causes=["sleep"], concerning=False)

    monkeypatch.setattr(gemini, "parse_checkin", parse)
    return seen


def test_checkin_saves_and_fans_out(as_user, db, fake_parse):
    db.on("WITH d AS (DELETE FROM checkins", 0)
    r = as_user(STUDENT).post("/api/checkins", json={"text": " barely slept "})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body | {"time": None} == {"time": None, "stress": 8, "sleep_hours": 4.0, "causes": ["sleep"],
                                     "concerning": False, "replaced_earlier": False}
    assert dt.datetime.fromisoformat(body["time"]).utcoffset() is not None
    assert fake_parse["text"] == "barely slept"  # only the text goes to Gemini

    start, end = db.sql("WITH d AS (DELETE FROM checkins")[0][1:]
    assert end - start in (dt.timedelta(hours=23), dt.timedelta(hours=24), dt.timedelta(hours=25))
    assert db.sql("FOR UPDATE") == [(STUDENT.id,)]
    saved = db.sql("INSERT INTO checkins")[0]
    assert saved[1:] == (STUDENT.id, 8, 4.0, ["sleep"], "barely slept")
    assert db.sql("INSERT INTO checkin_course")[0][1:] == (STUDENT.id, 8)
    kinds = [k for k, *_ in db.calls]
    assert kinds.index("tx") < len(kinds) - 1 and db.calls[-1][1] == "COMMIT"


def test_second_checkin_same_day_replaces(as_user, db, fake_parse):
    db.on("WITH d AS (DELETE FROM checkins", 1)
    assert as_user(STUDENT).post("/api/checkins", json={"text": "again"}).json()["replaced_earlier"] is True


def test_checkin_concerning_flag_passes_through(as_user, db, monkeypatch):
    async def parse(text):
        return gemini.ParsedCheckin(stress=9, sleep_hours=None, causes=[], concerning=True)

    monkeypatch.setattr(gemini, "parse_checkin", parse)
    db.on("WITH d AS (DELETE FROM checkins", 0)
    assert as_user(STUDENT).post("/api/checkins", json={"text": "hopeless"}).json()["concerning"] is True


@pytest.mark.parametrize("text", ["   ", "x" * 2001])
def test_checkin_validation(as_user, db, fake_parse, text):
    check_error(as_user(STUDENT).post("/api/checkins", json={"text": text}), 400, "bad_request")
    assert "text" not in fake_parse


# --- trend and heads-up ---


def test_trend(as_user, db):
    db.on("FROM checkins WHERE user_id", [{"date": dt.date(2026, 11, 1), "stress": 5, "sleep_hours": 7.0}])
    db.on("FROM enrollments WHERE user_id", [{"course_id": 1}])
    db.on("created_by = $2) DESC", [deadline_row(12, "Midterm 1", "2026-10-14", 20, kind="midterm")])
    body = as_user(STUDENT).get("/api/me/trend").json()
    assert body["points"] == [{"date": "2026-11-01", "stress": 5, "sleep_hours": 7.0}]
    assert body["deadlines"][0]["title"] == "Midterm 1"
    args = db.sql("FROM checkins WHERE user_id")[0]
    assert args[1] is None and args[3] == "America/Vancouver"  # no lower bound by default


def test_trend_range_filters_deadlines(as_user, db):
    db.on("FROM enrollments WHERE user_id", [{"course_id": 1}])
    db.on("created_by = $2) DESC", [deadline_row(1, "A", "2026-10-01"), deadline_row(2, "B", "2026-11-03")])
    body = as_user(STUDENT).get("/api/me/trend?from=2026-11-01&to=2026-11-30").json()
    assert [d["title"] for d in body["deadlines"]] == ["B"]


@pytest.mark.parametrize("query", ["from=2026-11-30&to=2026-11-01", "from=not-a-date"])
def test_trend_bad_range(as_user, db, query):
    check_error(as_user(STUDENT).get(f"/api/me/trend?{query}"), 400, "bad_request")


def test_heads_up(as_user, db, monkeypatch):
    monkeypatch.setattr(localtime, "today", lambda: dt.date(2026, 11, 1))
    db.on("FROM enrollments WHERE user_id", [{"course_id": 1}])
    db.on("(created_by IS NULL) DESC", [
        deadline_row(1, "Midterm 2", "2026-11-03", 20, kind="midterm"),
        deadline_row(2, "Project Phase 3", "2026-11-05", 25, kind="project"),
        deadline_row(3, "Quiz 4", "2026-11-07", 10, kind="quiz"),
    ])
    [c] = as_user(STUDENT).get("/api/me/heads-up").json()["collisions"]
    assert (c["start"], c["deadline_count"], c["total_weight_pct"]) == ("2026-11-03", 3, 55.0)
    assert c["message"] == "3 assessments worth 55% in 5 days. Start Project Phase 3 early."


def test_malformed_multipart_is_400(as_user, db):
    r = as_user(STUDENT).post("/api/syllabus", content=b"garbage",
                              headers={"content-type": "multipart/form-data; boundary=x"})
    check_error(r, 400, "bad_request")


def test_update_deadline_deleted_mid_request(as_user, db):
    db.on("SELECT created_by FROM deadlines", {"created_by": STUDENT.id})  # owned, but UPDATE matched nothing
    body = {"title": "X", "due_date": "2026-10-14", "weight_pct": 5, "type": "quiz"}
    check_error(as_user(STUDENT).put("/api/deadlines/7", json=body), 404, "not_found")
