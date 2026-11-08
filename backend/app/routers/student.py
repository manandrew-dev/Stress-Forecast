"""Student endpoints (issue #16). Shapes in docs/api.md."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from pydantic import ValidationError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from .. import localtime
from ..auth import AuthenticatedUser, require_role
from ..config import MAX_CHECKIN_CHARS, MAX_SYLLABUS_BYTES, MAX_SYLLABUS_CHARS
from ..db import Pool
from ..models import (
    CheckinRequest,
    CheckinResponse,
    Deadline,
    DeadlineInput,
    DeadlinesResponse,
    EnrollmentsRequest,
    HeadsUpResponse,
    SaveDeadlinesRequest,
    SyllabusRequest,
    SyllabusResponse,
    TrendPoint,
    TrendResponse,
)
from ..services import cohort, collisions, gemini
from ..services.deadlines import course_deadlines, enrolled_course_ids, student_deadlines
from ..services.syllabus import SyllabusTextError, pdf_text

router = APIRouter(dependencies=[Depends(require_role("student"))])

Student = Annotated[AuthenticatedUser, Depends(require_role("student"))]

_DEADLINE_COLUMNS = "id, course_id, title, due_date, weight_pct::float8 AS weight_pct, type"


# --- helpers ---


async def _require_enrolled(db, user_id: str, course_id: int) -> None:
    row = await db.fetchrow(
        """
        SELECT EXISTS (SELECT 1 FROM courses WHERE id = $2) AS course_exists,
               EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2) AS enrolled
        """,
        user_id,
        course_id,
    )
    if not row["course_exists"]:
        raise HTTPException(404, "Course not found")
    if not row["enrolled"]:
        raise HTTPException(403, "Add this course to your courses first")


def _clean_deadline(d: DeadlineInput) -> DeadlineInput:
    title = d.title.strip()
    if not title:
        raise HTTPException(400, "Deadline title is required")
    if d.weight_pct is not None and not 0 <= d.weight_pct <= 100:
        raise HTTPException(400, "Deadline weight must be between 0 and 100")
    return d.model_copy(update={"title": title})


# --- enrollments ---


@router.put("/me/courses", status_code=204)
async def set_courses(body: EnrollmentsRequest, user: Student, db: Pool) -> Response:
    course_ids = sorted(set(body.course_ids))
    known = await db.fetchval("SELECT count(*) FROM courses WHERE id = ANY($1::int[])", course_ids)
    if known != len(course_ids):
        raise HTTPException(400, "Unknown course id")
    async with db.acquire() as conn, conn.transaction():
        await conn.execute("DELETE FROM enrollments WHERE user_id = $1", user.id)
        await conn.executemany(
            "INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)",
            [(user.id, cid) for cid in course_ids],
        )
    return Response(status_code=204)


# --- syllabus and deadlines ---


async def _syllabus_input(request: Request) -> tuple[int, str]:
    """Accepts JSON {course_id, text} or multipart course_id + file (PDF)."""
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        try:
            form = await request.form(max_files=1, max_fields=4)
        except MultiPartException:
            raise HTTPException(400, "Could not read the upload") from None
        try:
            course_id = int(str(form.get("course_id", "")))
        except ValueError:
            raise HTTPException(400, "course_id must be a number") from None
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise HTTPException(400, "Attach the syllabus as a PDF file")
        data = await upload.read(MAX_SYLLABUS_BYTES + 1)
        if len(data) > MAX_SYLLABUS_BYTES:
            raise HTTPException(400, "The PDF is too large (10 MB max)")
        try:
            return course_id, pdf_text(data)
        except SyllabusTextError as exc:
            raise HTTPException(400, str(exc)) from None

    try:
        body = SyllabusRequest.model_validate_json(await request.body())
    except ValidationError:
        raise HTTPException(400, "Send course_id and text, or upload a PDF") from None
    return body.course_id, body.text


@router.post("/syllabus", response_model=SyllabusResponse)
async def extract_syllabus(request: Request, user: Student, db: Pool) -> SyllabusResponse:
    course_id, text = await _syllabus_input(request)
    text = text.strip()
    if not text:
        raise HTTPException(400, "The syllabus text is empty")
    if len(text) > MAX_SYLLABUS_CHARS:
        raise HTTPException(400, "The syllabus is too long")
    await _require_enrolled(db, user.id, course_id)
    deadlines = await gemini.extract_deadlines(text, today=localtime.today())
    return SyllabusResponse(course_id=course_id, deadlines=deadlines)


@router.post("/deadlines", response_model=DeadlinesResponse)
async def save_deadlines(body: SaveDeadlinesRequest, user: Student, db: Pool) -> DeadlinesResponse:
    cleaned = [_clean_deadline(d) for d in body.deadlines]
    await _require_enrolled(db, user.id, body.course_id)
    async with db.acquire() as conn, conn.transaction():
        # Replaces only this student's own copies for the course.
        await conn.execute(
            "DELETE FROM deadlines WHERE course_id = $1 AND created_by = $2", body.course_id, user.id
        )
        saved = []
        for d in cleaned:
            row = await conn.fetchrow(
                f"""
                INSERT INTO deadlines (course_id, title, due_date, weight_pct, type, created_by)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING {_DEADLINE_COLUMNS}
                """,
                body.course_id, d.title, d.due_date, d.weight_pct, d.type, user.id,
            )
            saved.append(Deadline(**dict(row)))
    return DeadlinesResponse(deadlines=saved)


async def _own_deadline_or_raise(db, deadline_id: int, user_id: str) -> None:
    created_by = await db.fetchrow("SELECT created_by FROM deadlines WHERE id = $1", deadline_id)
    if created_by is None:
        raise HTTPException(404, "Deadline not found")
    if created_by["created_by"] != user_id:
        raise HTTPException(403, "Only the student who saved this deadline can change it")


@router.put("/deadlines/{deadline_id}", response_model=Deadline)
async def update_deadline(
    deadline_id: Annotated[int, Path()], body: DeadlineInput, user: Student, db: Pool
) -> Deadline:
    d = _clean_deadline(body)
    row = await db.fetchrow(
        f"""
        UPDATE deadlines SET title = $3, due_date = $4, weight_pct = $5, type = $6
        WHERE id = $1 AND created_by = $2
        RETURNING {_DEADLINE_COLUMNS}
        """,
        deadline_id, user.id, d.title, d.due_date, d.weight_pct, d.type,
    )
    if row is None:
        await _own_deadline_or_raise(db, deadline_id, user.id)
        raise HTTPException(404, "Deadline not found")  # deleted between the two queries
    return Deadline(**dict(row))


@router.delete("/deadlines/{deadline_id}", status_code=204)
async def delete_deadline(deadline_id: Annotated[int, Path()], user: Student, db: Pool) -> Response:
    deleted = await db.fetchval(
        "WITH d AS (DELETE FROM deadlines WHERE id = $1 AND created_by = $2 RETURNING 1) SELECT count(*) FROM d",
        deadline_id, user.id,
    )
    if not deleted:
        await _own_deadline_or_raise(db, deadline_id, user.id)
    return Response(status_code=204)


# --- check-ins ---


@router.post("/checkins", response_model=CheckinResponse)
async def create_checkin(body: CheckinRequest, user: Student, db: Pool) -> CheckinResponse:
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "The check-in is empty")
    if len(text) > MAX_CHECKIN_CHARS:
        raise HTTPException(400, f"Keep the check-in under {MAX_CHECKIN_CHARS} characters")

    # Only the check-in text goes to Gemini (no name, email or user id).
    parsed = await gemini.parse_checkin(text)

    now = localtime.now()
    start, end = localtime.day_bounds(now.date())
    async with db.acquire() as conn, conn.transaction():
        # Serialize this student's check-ins so same-day replacement can't race.
        await conn.execute("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", user.id)
        replaced = await conn.fetchval(
            """
            WITH d AS (DELETE FROM checkins WHERE user_id = $1 AND time >= $2 AND time < $3 RETURNING 1)
            SELECT count(*) FROM d
            """,
            user.id, start, end,
        )
        await conn.execute(
            "DELETE FROM checkin_course WHERE user_id = $1 AND time >= $2 AND time < $3", user.id, start, end
        )
        await conn.execute(
            """
            INSERT INTO checkins (time, user_id, stress, sleep_hours, causes, raw_text)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            now, user.id, parsed.stress, parsed.sleep_hours, parsed.causes, text,
        )
        # Fan out to every enrolled course for the cohort aggregate.
        await conn.execute(
            """
            INSERT INTO checkin_course (time, course_id, user_id, stress)
            SELECT $1, course_id, $2, $3 FROM enrollments WHERE user_id = $2
            """,
            now, user.id, parsed.stress,
        )

    return CheckinResponse(
        time=now,
        stress=parsed.stress,
        sleep_hours=parsed.sleep_hours,
        causes=parsed.causes,
        concerning=parsed.concerning,
        replaced_earlier=replaced > 0,
    )


# --- trend and heads-up ---


@router.get("/me/trend", response_model=TrendResponse)
async def get_trend(
    user: Student,
    db: Pool,
    from_date: Annotated[dt.date | None, Query(alias="from")] = None,
    to_date: Annotated[dt.date | None, Query(alias="to")] = None,
) -> TrendResponse:
    """Own check-ins and deadlines. Without a range: every check-in up to today, all deadlines."""
    if from_date and to_date and from_date > to_date:
        raise HTTPException(400, "from must be on or before to")
    start = localtime.day_bounds(from_date)[0] if from_date else None
    end = localtime.day_bounds(to_date or localtime.today())[1]

    rows = await db.fetch(
        """
        SELECT DISTINCT ON (local_day) local_day AS date, stress, sleep_hours::float8 AS sleep_hours
        FROM (
            SELECT (time AT TIME ZONE $4)::date AS local_day, time, stress, sleep_hours
            FROM checkins
            WHERE user_id = $1 AND ($2::timestamptz IS NULL OR time >= $2) AND time < $3
        ) AS own
        ORDER BY local_day, time DESC
        """,
        user.id, start, end, localtime.TZ.key,
    )
    deadlines = await student_deadlines(db, user.id, await enrolled_course_ids(db, user.id))
    deadlines = [
        d for d in deadlines
        if (from_date is None or d.due_date >= from_date) and (to_date is None or d.due_date <= to_date)
    ]
    return TrendResponse(points=[TrendPoint(**dict(r)) for r in rows], deadlines=deadlines)


@router.get("/me/heads-up", response_model=HeadsUpResponse)
async def get_heads_up(user: Student, db: Pool) -> HeadsUpResponse:
    course_ids = await enrolled_course_ids(db, user.id)
    deadlines = await course_deadlines(db, course_ids)
    codes = await cohort.course_codes(db, course_ids)
    return HeadsUpResponse(collisions=collisions.heads_up(deadlines, localtime.today(), codes))
