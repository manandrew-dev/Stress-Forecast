"""Shared endpoints are implemented in issue #16."""

from fastapi import APIRouter, Depends

from ..auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])
