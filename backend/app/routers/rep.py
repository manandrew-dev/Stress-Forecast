"""Representative endpoints (issue #17). Shapes in docs/api.md.

Every route needs the rep role and a rep_assignments row for {course_id}
(``require_rep_course``). No response contains user ids, raw text, or per-student rows.
"""

import datetime as dt
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from .. import localtime
from ..auth import require_rep_course
from ..config import COHORT_MIN, REPORT_CACHE_SECONDS
from ..db import Pool
from ..models import (
    CohortResponse,
    CollisionsResponse,
    Course,
    Insight,
    InsightsResponse,
    ReportResponse,
)
from ..services import cohort, collisions, gemini
from ..services.deadlines import course_deadlines

# Every route in this router uses a {course_id} path parameter.
router = APIRouter(dependencies=[Depends(require_rep_course)])

CourseId = Annotated[int, Path()]
MAX_RANGE_DAYS = 366

# (course_id, week_start) -> (expires_at, report). Keeps Gemini calls to one per course-week.
_report_cache: dict[tuple[int, dt.date], tuple[float, ReportResponse]] = {}


async def _course_or_404(db, course_id: int) -> Course:
    course = await cohort.get_course(db, course_id)
    if course is None:
        raise HTTPException(404, "Course not found")
    return course


@router.get("/courses/{course_id}/cohort", response_model=CohortResponse)
async def get_cohort(
    course_id: CourseId,
    db: Pool,
    from_date: Annotated[dt.date | None, Query(alias="from")] = None,
    to_date: Annotated[dt.date | None, Query(alias="to")] = None,
) -> CohortResponse:
    """Daily cohort stress. Without a range: first visible day to today, all deadlines."""
    course = await _course_or_404(db, course_id)
    end = to_date or localtime.today()
    if from_date and from_date > end:
        raise HTTPException(400, "from must be on or before to")
    if from_date and (end - from_date).days >= MAX_RANGE_DAYS:
        raise HTTPException(400, "Date range is too long")

    days = await cohort.cohort_days(db, course_id, from_date, end)
    deadlines = [
        d for d in await course_deadlines(db, [course_id])
        if (from_date is None or d.due_date >= from_date) and (to_date is None or d.due_date <= to_date)
    ]
    return CohortResponse(course=course, min_students=COHORT_MIN, days=days, deadlines=deadlines)


@router.get("/courses/{course_id}/collisions", response_model=CollisionsResponse)
async def get_collisions(course_id: CourseId, db: Pool) -> CollisionsResponse:
    await _course_or_404(db, course_id)
    deadlines = await course_deadlines(db, [course_id])
    stress = await cohort.daily_stress(db, course_id)
    return CollisionsResponse(collisions=collisions.rep_collisions(deadlines, stress))


@router.get("/courses/{course_id}/report", response_model=ReportResponse)
async def get_report(
    course_id: CourseId,
    db: Pool,
    week_start: Annotated[dt.date | None, Query()] = None,
) -> ReportResponse:
    """Weekly Gemini report from non-suppressed aggregates, deadlines and collisions only."""
    course = await _course_or_404(db, course_id)
    week = localtime.week_start(week_start or localtime.today())

    key = (course_id, week)
    cached = _report_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    # The report week plus the week before, so the summary can describe the change.
    aggregates = await cohort.daily_stress(
        db, course_id, week - dt.timedelta(days=7), week + dt.timedelta(days=6)
    )
    if not any(week <= day <= week + dt.timedelta(days=6) for day, _ in aggregates):
        # Nothing visible for the week: don't spend a Gemini call or let it guess.
        report = ReportResponse(
            week_start=week,
            summary="Not enough check-ins this week to report on yet.",
            top_cause="not enough data",
            suggested_fix="Encourage more students to check in so the cohort view has enough responses.",
        )
    else:
        deadlines = await course_deadlines(db, [course_id])
        flagged = collisions.rep_collisions(deadlines, await cohort.daily_stress(db, course_id))
        result = await gemini.weekly_report(course, aggregates, deadlines, flagged, week_start=week)
        report = ReportResponse(week_start=week, **result.model_dump())

    _report_cache[key] = (time.monotonic() + REPORT_CACHE_SECONDS, report)
    return report


@router.get("/courses/{course_id}/insights", response_model=InsightsResponse)
async def get_insights(course_id: CourseId, db: Pool) -> InsightsResponse:
    rows = await db.fetch(
        "SELECT week_start, finding FROM insights WHERE course_id = $1 ORDER BY week_start DESC, id DESC",
        course_id,
    )
    return InsightsResponse(insights=[Insight(**dict(r)) for r in rows])
