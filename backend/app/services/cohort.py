"""Cohort aggregate queries with the 5-student rule (issue #17).

This is the only module that reads ``daily_course_stress``, and every query filters
``n_students >= COHORT_MIN`` in SQL, so suppressed values never leave the database.
Days without a visible row are returned as suppressed (all-null) entries.
"""

import datetime as dt

import asyncpg

from .. import localtime
from ..config import COHORT_MIN
from ..models import Course, SuppressedCohortDay, VisibleCohortDay

DailyStress = tuple[dt.date, float]

_VISIBLE_SQL = """
SELECT (day AT TIME ZONE $5)::date AS date, avg_stress::float8 AS avg_stress, n_students
FROM daily_course_stress
WHERE course_id = $1
  AND n_students >= $2
  AND ($3::timestamptz IS NULL OR day >= $3)
  AND ($4::timestamptz IS NULL OR day < $4)
ORDER BY day
"""

Executor = asyncpg.Pool | asyncpg.Connection


async def get_course(db: Executor, course_id: int) -> Course | None:
    row = await db.fetchrow("SELECT id, code, name, term FROM courses WHERE id = $1", course_id)
    return Course(**dict(row)) if row else None


async def _visible_rows(db: Executor, course_id: int, start: dt.date | None, end: dt.date | None):
    lower = localtime.day_bounds(start)[0] if start else None
    upper = localtime.day_bounds(end)[1] if end else None
    return await db.fetch(_VISIBLE_SQL, course_id, COHORT_MIN, lower, upper, localtime.TZ.key)


async def daily_stress(
    db: Executor, course_id: int, start: dt.date | None = None, end: dt.date | None = None
) -> list[DailyStress]:
    """Non-suppressed (date, avg_stress) pairs, for collisions and the weekly report."""
    return [(r["date"], r["avg_stress"]) for r in await _visible_rows(db, course_id, start, end)]


async def cohort_days(
    db: Executor, course_id: int, start: dt.date | None, end: dt.date
) -> list[VisibleCohortDay | SuppressedCohortDay]:
    """One entry per day from ``start`` (default: first visible day) to ``end``."""
    rows = await _visible_rows(db, course_id, start, end)
    visible = {r["date"]: r for r in rows}
    first = start or (min(visible) if visible else end)
    days = []
    day = first
    while day <= end:
        r = visible.get(day)
        if r is not None:
            days.append(VisibleCohortDay(
                date=day, avg_stress=round(r["avg_stress"], 2), n_students=r["n_students"], suppressed=False
            ))
        else:
            days.append(SuppressedCohortDay(date=day, avg_stress=None, n_students=None, suppressed=True))
        day += dt.timedelta(days=1)
    return days
