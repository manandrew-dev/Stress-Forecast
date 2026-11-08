"""Student endpoints are implemented in issue #16."""

from fastapi import APIRouter, Depends

from ..auth import require_role

router = APIRouter(dependencies=[Depends(require_role("student"))])
