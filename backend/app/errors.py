from collections.abc import Mapping
from http import HTTPStatus

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .models import ErrorCode, ErrorDetail, ErrorResponse

ERROR_CODES: dict[int, ErrorCode] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    422: "ai_parse_failed",
    500: "internal",
}


def error_response(
    status_code: int,
    message: str | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    if status_code == 500 or status_code not in ERROR_CODES:
        status_code = 500
        message = None
        headers = None

    error = ErrorDetail(
        code=ERROR_CODES[status_code],
        message=message or HTTPStatus(status_code).phrase,
    )
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=error).model_dump(),
        headers=headers,
    )


async def handle_http_error(_request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else None
    return error_response(exc.status_code, message, exc.headers)


async def handle_invalid_request(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return error_response(400, "Invalid request body or parameters")


async def handle_ai_parse_error(_request: Request, _exc: Exception) -> JSONResponse:
    return error_response(422, "The AI couldn't read that. Please try again or rephrase it.")


async def handle_internal_error(_request: Request, _exc: Exception) -> JSONResponse:
    return error_response(500)
