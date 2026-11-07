from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI

from .config import DATABASE_URL


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
