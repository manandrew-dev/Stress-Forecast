from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import logging
from typing import Annotated

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request

from .config import DATABASE_URL

_logger = logging.getLogger(__name__)


def _pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        _logger.error("This endpoint requires a configured DATABASE_URL")
        raise HTTPException(500)
    return pool


# Route dependency: the shared connection pool.
Pool = Annotated[asyncpg.Pool, Depends(_pool)]


@asynccontextmanager
async def database_lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.db_pool = None
    if not DATABASE_URL:
        yield
        return

    # Defer connecting until a caller first acquires a connection.
    async with asyncpg.create_pool(DATABASE_URL, min_size=0) as pool:
        app.state.db_pool = pool
        try:
            yield
        finally:
            app.state.db_pool = None
