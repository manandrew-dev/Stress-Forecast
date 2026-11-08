import asyncio
import json
from io import BytesIO
from time import time
from typing import Annotated
from unittest.mock import AsyncMock
from urllib.error import URLError
from urllib.request import OpenerDirector

import asyncpg
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.testclient import TestClient

from app import auth, config
from app.main import api
from app.routers import courses, rep, student

DOMAIN = "stress-forecast.example.test"
ISSUER = f"https://{DOMAIN}/"
AUDIENCE = "https://api.stressforecast.app"
SUBJECT = "auth0|demo-subject"
KID = "test-key"


def public_jwk(key, kid):
    return jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True) | {
        "alg": "RS256", "kid": kid, "use": "sig",
    }


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def jwks(monkeypatch, signing_key):
    keys = [public_jwk(signing_key, KID)]
    requests = []

    def open_jwks(_opener, request, *, timeout):
        requests.append((request.full_url, timeout))
        assert request.full_url == f"{ISSUER}.well-known/jwks.json"
        assert request.get_header("Authorization") is None
        return BytesIO(json.dumps({"keys": keys}).encode())

    monkeypatch.setattr(OpenerDirector, "open", open_jwks)
    monkeypatch.setattr(config, "AUTH0_DOMAIN", DOMAIN)
    monkeypatch.setattr(config, "AUTH0_AUDIENCE", AUDIENCE)
    auth._jwks_client.cache_clear()
    yield keys, requests
    auth._jwks_client.cache_clear()


@pytest.fixture
def make_token(signing_key):
    def encode(*, overrides=None, omit=(), key=signing_key, kid=KID, algorithm="RS256"):
        now = int(time())
        claims = {
            "iss": ISSUER, "aud": AUDIENCE, "sub": SUBJECT,
            "iat": now, "exp": now + 60, auth.ROLES_CLAIM: ["student"],
        }
        claims.update(overrides or {})
        for name in omit:
            claims.pop(name)
        headers = {"kid": kid} if kid is not None else {}
        return jwt.encode(claims, key, algorithm=algorithm, headers=headers)

    return encode


@pytest.fixture
def pool():
    database = AsyncMock(spec=asyncpg.Pool)
    database.fetchval.return_value = False
    return database


@pytest.fixture
def client(jwks, pool):
    app = FastAPI(exception_handlers=api.exception_handlers)
    app.state.db_pool = pool

    shared = APIRouter(dependencies=courses.router.dependencies)
    students = APIRouter(dependencies=student.router.dependencies)
    reps = APIRouter(dependencies=rep.router.dependencies)

    @shared.get("/me")
    async def me(user: Annotated[auth.AuthenticatedUser, Depends(auth.get_current_user)]):
        return user

    @students.get("/me/trend")
    async def trend():
        return {"points": []}

    @reps.get("/courses/{course_id}/cohort")
    async def cohort(course_id: int):
        return {"course_id": course_id}

    for router in (shared, students, reps):
        app.include_router(router, prefix="/api")
    with TestClient(app) as http:
        yield http


def authorization(token):
    return {"Authorization": f"Bearer {token}"}


def check_error(response, status, code):
    assert response.status_code == status
    assert set(response.json()) == {"error"}
    error = response.json()["error"]
    assert set(error) == {"code", "message"}
    assert error["code"] == code
    assert error["message"]
    if status == 401:
        assert response.headers["WWW-Authenticate"] == "Bearer"


def test_valid_token_and_jwks_cache(client, jwks, make_token, pool):
    token = make_token(overrides={"aud": [AUDIENCE, "https://userinfo.example.test"]})
    for _ in range(2):
        response = client.get("/api/me", headers=authorization(token))
        assert response.json() == {"id": SUBJECT, "role": "student"}
    assert jwks[1] == [(f"{ISSUER}.well-known/jwks.json", 3)]
    assert pool.execute.await_count == 2
    assert pool.execute.await_args.args[1:] == (SUBJECT, "student")


@pytest.mark.parametrize("header", [None, "Basic dGVzdA==", "Bearer", "Bearer a.b.c extra", "Bearer garbage"])
def test_missing_or_malformed_header(client, jwks, pool, header):
    headers = {"Authorization": header} if header is not None else {}
    check_error(client.get("/api/me", headers=headers), 401, "unauthorized")
    assert jwks[1] == []
    pool.execute.assert_not_awaited()


@pytest.mark.parametrize("claim,value", [
    ("exp", 1), ("exp", "99999999999"), ("exp", None),
    ("iss", "https://other-tenant.example.test/"), ("iss", ISSUER.rstrip("/")),
    ("aud", "https://other-api.example.test"),
    ("sub", ""), ("sub", 123),
    ("iat", 99999999999), ("nbf", 99999999999), ("nbf", True),
])
def test_invalid_claims(client, make_token, pool, claim, value):
    token = make_token(overrides={claim: value})
    check_error(client.get("/api/me", headers=authorization(token)), 401, "unauthorized")
    pool.execute.assert_not_awaited()


@pytest.mark.parametrize("claim", ["iss", "aud", "exp", "sub"])
def test_required_claims(client, make_token, pool, claim):
    check_error(client.get("/api/me", headers=authorization(make_token(omit=[claim]))), 401, "unauthorized")
    pool.execute.assert_not_awaited()


def test_invalid_signature(client, make_token, pool):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    check_error(client.get("/api/me", headers=authorization(make_token(key=other_key))), 401, "unauthorized")
    pool.execute.assert_not_awaited()


def test_wrong_algorithm(client, jwks, make_token):
    token = make_token(key=rsa.generate_private_key(public_exponent=65537, key_size=2048), algorithm="PS256")
    check_error(client.get("/api/me", headers=authorization(token)), 401, "unauthorized")
    assert jwks[1] == []


@pytest.mark.parametrize("kid", [None, "", "unknown-key"])
def test_missing_or_unknown_kid(client, make_token, kid):
    check_error(client.get("/api/me", headers=authorization(make_token(kid=kid))), 401, "unauthorized")


def test_jwks_rotation_refresh(client, jwks, make_token, monkeypatch):
    assert client.get("/api/me", headers=authorization(make_token())).status_code == 200
    rotated = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwks[0].append(public_jwk(rotated, "rotated-key"))
    token = make_token(key=rotated, kid="rotated-key")
    check_error(client.get("/api/me", headers=authorization(token)), 401, "unauthorized")
    assert len(jwks[1]) == 1
    monkeypatch.setattr(auth._jwks_client(ISSUER), "cooldown_duration", 0)
    assert client.get("/api/me", headers=authorization(token)).status_code == 200
    assert len(jwks[1]) == 2


@pytest.mark.parametrize("roles", [None, [], "student", ["other"], ["student", "rep"]])
def test_invalid_application_role(client, make_token, pool, roles):
    token = make_token(omit=[auth.ROLES_CLAIM]) if roles is None else make_token(overrides={auth.ROLES_CLAIM: roles})
    check_error(client.get("/api/me/trend", headers=authorization(token)), 403, "forbidden")
    pool.execute.assert_not_awaited()


def test_student_cannot_access_rep_route(client, make_token, pool):
    response = client.get("/api/courses/4/cohort", headers=authorization(make_token()))
    check_error(response, 403, "forbidden")
    assert response.json()["error"]["message"] == "Rep role required"
    pool.execute.assert_not_awaited()
    pool.fetchval.assert_not_awaited()


def test_rep_only_accesses_assigned_course(client, make_token, pool):
    async def has_assignment(_query, user_id, course_id):
        return (user_id, course_id) == (SUBJECT, 4)

    pool.fetchval.side_effect = has_assignment
    headers = authorization(make_token(overrides={auth.ROLES_CLAIM: ["rep"]}))
    assert client.get("/api/me", headers=headers).json()["role"] == "rep"
    check_error(client.get("/api/me/trend", headers=headers), 403, "forbidden")
    assert client.get("/api/courses/4/cohort", headers=headers).json() == {"course_id": 4}
    response = client.get("/api/courses/5/cohort?course_id=4", headers=headers)
    check_error(response, 403, "forbidden")
    query, user_id, course_id = pool.fetchval.await_args.args
    assert "rep_assignments WHERE user_id = $1 AND course_id = $2" in query
    assert (user_id, course_id) == (SUBJECT, 5)


def test_user_upsert_uses_verified_subject_and_updates_role(client, make_token, pool):
    for role in ("student", "rep"):
        token = make_token(overrides={auth.ROLES_CLAIM: [role]})
        response = client.get("/api/me?user_id=unverified", headers=authorization(token))
        assert response.json() == {"id": SUBJECT, "role": role}
        sql, subject, stored_role = pool.execute.await_args.args
        assert "INSERT INTO users (id, role) VALUES ($1, $2)" in sql
        assert "ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role" in sql
        assert SUBJECT not in sql and (subject, stored_role) == (SUBJECT, role)


def test_concurrent_user_synchronization(pool):
    # Both dependency calls must reach the same atomic database upsert.
    app = FastAPI()
    app.state.db_pool = pool
    request = Request({"type": "http", "app": app})
    user = auth.AuthenticatedUser(SUBJECT, "student")

    async def run():
        both_entered = asyncio.Event()
        calls = []

        async def execute(sql, *args):
            calls.append((sql, args))
            if len(calls) == 2:
                both_entered.set()
            await both_entered.wait()

        pool.execute.side_effect = execute
        results = await asyncio.wait_for(asyncio.gather(
            auth.get_current_user(request, user), auth.get_current_user(request, user),
        ), timeout=2)
        assert results == [user, user]
        assert len(calls) == 2 and calls[0] == calls[1]
        assert "ON CONFLICT (id) DO UPDATE" in calls[0][0]

    asyncio.run(run())


def test_jwks_unavailable_is_sanitized(client, make_token, monkeypatch, caplog, pool):
    token = make_token()

    def unavailable(*_args, **_kwargs):
        raise URLError(token)

    monkeypatch.setattr(OpenerDirector, "open", unavailable)
    response = client.get("/api/me", headers=authorization(token))
    check_error(response, 500, "internal")
    assert token not in response.text and token not in caplog.text
    pool.execute.assert_not_awaited()


def test_empty_jwks_fails_closed(client, jwks, make_token, pool):
    jwks[0].clear()
    response = client.get("/api/me", headers=authorization(make_token()))
    check_error(response, 500, "internal")
    pool.execute.assert_not_awaited()


def test_invalid_configuration_is_sanitized(client, jwks, make_token, monkeypatch, caplog):
    invalid_domain = "https://misconfigured.example.test/path"
    monkeypatch.setattr(config, "AUTH0_DOMAIN", invalid_domain)
    response = client.get("/api/me", headers=authorization(make_token()))
    check_error(response, 500, "internal")
    assert jwks[1] == []
    assert invalid_domain not in response.text and invalid_domain not in caplog.text
