"""Deadline queries shared by the student and rep routers.

Seeded (official) deadlines have ``created_by IS NULL``. ``POST /deadlines`` also saves a
copy per student, so the same assessment can appear many times. Every read here
de-duplicates by (course_id, lower(trim(title)), due_date):

- course level (cohort, collisions, report, heads-up): all rows, preferring the official one
- a student's own view (trend): official rows plus that student's rows, preferring theirs
"""

from collections.abc import Sequence

import asyncpg

from ..models import Deadline

_COLUMNS = "id, course_id, title, due_date, weight_pct::float8 AS weight_pct, type"
_DEDUPE_KEY = "course_id, lower(btrim(title)), due_date"

_COURSE_SQL = f"""
SELECT DISTINCT ON ({_DEDUPE_KEY}) {_COLUMNS}
FROM deadlines
WHERE course_id = ANY($1::int[])
ORDER BY {_DEDUPE_KEY}, (created_by IS NULL) DESC, id
"""

_STUDENT_SQL = f"""
SELECT DISTINCT ON ({_DEDUPE_KEY}) {_COLUMNS}
FROM deadlines
WHERE course_id = ANY($1::int[]) AND (created_by IS NULL OR created_by = $2)
ORDER BY {_DEDUPE_KEY}, (created_by = $2) DESC NULLS LAST, id
"""

Executor = asyncpg.Pool | asyncpg.Connection


def _to_models(rows) -> list[Deadline]:
    deadlines = [Deadline(**dict(r)) for r in rows]
    return sorted(deadlines, key=lambda d: (d.due_date, d.course_id, d.id))


async def course_deadlines(db: Executor, course_ids: Sequence[int]) -> list[Deadline]:
    """De-duplicated deadlines for whole courses (any student's copy counts)."""
    if not course_ids:
        return []
    return _to_models(await db.fetch(_COURSE_SQL, list(course_ids)))


async def student_deadlines(db: Executor, user_id: str, course_ids: Sequence[int]) -> list[Deadline]:
    """Official deadlines for the student's courses plus the student's own saved copies."""
    if not course_ids:
        return []
    return _to_models(await db.fetch(_STUDENT_SQL, list(course_ids), user_id))


async def enrolled_course_ids(db: Executor, user_id: str) -> list[int]:
    rows = await db.fetch("SELECT course_id FROM enrollments WHERE user_id = $1 ORDER BY course_id", user_id)
    return [r["course_id"] for r in rows]
