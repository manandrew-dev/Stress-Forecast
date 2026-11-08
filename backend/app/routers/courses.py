"""Shared endpoints (issue #16): GET /me, GET /courses."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import AuthenticatedUser, get_current_user
from ..db import Pool
from ..models import Course, CoursesResponse, MeResponse

router = APIRouter(dependencies=[Depends(get_current_user)])

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


@router.get("/me", response_model=MeResponse)
async def get_me(user: CurrentUser, db: Pool) -> MeResponse:
    # Students see their enrollments; reps see the courses they're assigned to.
    table = "enrollments" if user.role == "student" else "rep_assignments"
    rows = await db.fetch(
        f"""
        SELECT c.id, c.code, c.name, c.term
        FROM {table} AS link JOIN courses AS c ON c.id = link.course_id
        WHERE link.user_id = $1
        ORDER BY c.code, c.id
        """,
        user.id,
    )
    return MeResponse(id=user.id, role=user.role, courses=[Course(**dict(r)) for r in rows])


@router.get("/courses", response_model=CoursesResponse)
async def list_courses(db: Pool) -> CoursesResponse:
    rows = await db.fetch("SELECT id, code, name, term FROM courses ORDER BY code, id")
    return CoursesResponse(courses=[Course(**dict(r)) for r in rows])
