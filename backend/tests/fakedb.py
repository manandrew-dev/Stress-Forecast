"""A tiny stand-in for asyncpg.Pool: records every SQL call and answers from rules.

Rules are (substring, result) pairs checked in order against the SQL text; a result
may be a value or a callable taking the query args. Unmatched queries return None / [].
"""

import re
from contextlib import asynccontextmanager


class FakeDB:
    def __init__(self):
        self.rules: list[tuple[str, object]] = []
        self.calls: list[tuple[str, str, tuple]] = []

    def on(self, fragment: str, result):
        self.rules.append((fragment, result))
        return self

    def _answer(self, kind, sql, args, default):
        flat = re.sub(r"\s+", " ", sql).strip()
        self.calls.append((kind, flat, args))
        for fragment, result in self.rules:
            if fragment in flat:
                return result(*args) if callable(result) else result
        return default

    def sql(self, fragment: str) -> list[tuple]:
        """Args of every recorded call whose SQL contains ``fragment``."""
        return [args for _kind, flat, args in self.calls if fragment in flat]

    async def fetch(self, sql, *args):
        return self._answer("fetch", sql, args, [])

    async def fetchrow(self, sql, *args):
        return self._answer("fetchrow", sql, args, None)

    async def fetchval(self, sql, *args):
        return self._answer("fetchval", sql, args, None)

    async def execute(self, sql, *args):
        return self._answer("execute", sql, args, "OK")

    async def executemany(self, sql, rows):
        for row in rows:
            self._answer("executemany", sql, tuple(row), None)

    @asynccontextmanager
    async def acquire(self):
        yield self

    @asynccontextmanager
    async def transaction(self):
        self.calls.append(("tx", "BEGIN", ()))
        yield
        self.calls.append(("tx", "COMMIT", ()))
