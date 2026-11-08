"""Representative endpoints are implemented in issue #17."""

from fastapi import APIRouter, Depends

from ..auth import require_rep_course

# Every route in this router uses a {course_id} path parameter.
router = APIRouter(dependencies=[Depends(require_rep_course)])
