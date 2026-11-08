import logging
import re
from dataclasses import dataclass
from functools import cache, lru_cache
from typing import Annotated

import asyncpg
import jwt
from fastapi import Depends, HTTPException, Path, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import (
    InvalidKeyError,
    InvalidTokenError,
    PyJWKClientConnectionError,
    PyJWKClientError,
    PyJWKError,
    PyJWKSetError,
)

from . import config
from .models import Role

ROLES_CLAIM = "https://stressforecast.app/roles"
_SIGNING_ALGORITHM = "RS256"
_COMPACT_JWT = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_HOSTNAME = re.compile(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
_bearer = HTTPBearer(auto_error=False)
_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    role: Role


def _unauthorized() -> HTTPException:
    return HTTPException(401, "Missing or invalid access token", headers={"WWW-Authenticate": "Bearer"})


@lru_cache(maxsize=1)
def _jwks_client(issuer: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{issuer}.well-known/jwks.json", timeout=3)


def _verified_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthenticatedUser:
    # FastAPI runs this synchronous dependency off the event loop for JWKS I/O.
    token = credentials.credentials.strip() if credentials else ""
    if not _COMPACT_JWT.fullmatch(token):
        raise _unauthorized()

    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError:
        raise _unauthorized() from None
    kid = header.get("kid")
    if header.get("alg") != _SIGNING_ALGORITHM or not isinstance(kid, str) or not kid:
        raise _unauthorized()

    domain = (config.AUTH0_DOMAIN or "").strip()
    audience = (config.AUTH0_AUDIENCE or "").strip()
    if not _HOSTNAME.fullmatch(domain) or not audience:
        _logger.error("Set AUTH0_DOMAIN to the tenant hostname and AUTH0_AUDIENCE to the API identifier")
        raise HTTPException(500)
    issuer = f"https://{domain.lower()}/"

    try:
        key = _jwks_client(issuer).get_signing_key(kid)
    except (PyJWKClientConnectionError, PyJWKError, PyJWKSetError, OSError, ValueError, TypeError):
        _logger.error("Auth0 signing keys are unavailable")
        raise HTTPException(500) from None
    except PyJWKClientError:
        raise _unauthorized() from None

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[_SIGNING_ALGORITHM],
            audience=audience,
            issuer=issuer,
            options={"require": ["iss", "aud", "exp", "sub"], "enforce_minimum_key_length": True},
        )
    except (InvalidTokenError, InvalidKeyError, ValueError, TypeError, OverflowError):
        raise _unauthorized() from None

    if any(type(claims[name]) is not int for name in ("exp", "iat", "nbf") if name in claims):
        raise _unauthorized()
    subject = claims["sub"]
    if not subject.strip() or "\x00" in subject:
        raise _unauthorized()

    roles = claims.get(ROLES_CLAIM)
    if roles == ["student"]:
        return AuthenticatedUser(subject, "student")
    if roles == ["rep"]:
        return AuthenticatedUser(subject, "rep")
    raise HTTPException(403, "Exactly one Stress Forecast role is required")


def _database_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        _logger.error("Authentication requires a configured DATABASE_URL")
        raise HTTPException(500)
    return pool


async def _sync_user(request: Request, user: AuthenticatedUser) -> AuthenticatedUser:
    try:
        await _database_pool(request).execute(
            """
            INSERT INTO users (id, role) VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
            WHERE users.role IS DISTINCT FROM EXCLUDED.role
            """,
            user.id,
            user.role,
        )
    except (asyncpg.PostgresError, asyncpg.InterfaceError, OSError):
        _logger.error("Could not synchronize the authenticated user")
        raise HTTPException(500) from None
    return user


async def get_current_user(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(_verified_user)],
) -> AuthenticatedUser:
    """Require a verified user with either application role."""
    return await _sync_user(request, user)


@cache
def require_role(role: Role):
    """Require the given application role before synchronizing the user."""

    async def check_role(
        request: Request,
        user: Annotated[AuthenticatedUser, Depends(_verified_user)],
    ) -> AuthenticatedUser:
        if user.role != role:
            raise HTTPException(403, f"{role.capitalize()} role required")
        return await _sync_user(request, user)

    return check_role


async def require_rep_course(
    course_id: Annotated[int, Path()],
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(require_role("rep"))],
) -> AuthenticatedUser:
    """Require a representative assignment for the course in the URL."""
    try:
        assigned = await _database_pool(request).fetchval(
            "SELECT EXISTS (SELECT 1 FROM rep_assignments WHERE user_id = $1 AND course_id = $2)",
            user.id,
            course_id,
        )
    except (asyncpg.PostgresError, asyncpg.InterfaceError, OSError):
        _logger.error("Could not check the representative's course assignment")
        raise HTTPException(500) from None
    if not assigned:
        raise HTTPException(403, "Rep is not assigned to this course")
    return user
