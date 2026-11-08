from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import Response

from .config import CORS_ORIGINS
from .db import database_lifespan
from .errors import (
    error_response,
    handle_ai_parse_error,
    handle_http_error,
    handle_internal_error,
    handle_invalid_request,
)
from .routers import courses, rep, student
from .services.gemini import AIParseError


class APICORSMiddleware(CORSMiddleware):
    def preflight_response(self, request_headers: Headers) -> Response:
        response = super().preflight_response(request_headers)
        if response.status_code == 400:
            headers = dict(response.headers)
            del headers["content-length"]
            del headers["content-type"]
            return error_response(400, "CORS preflight rejected", headers)
        return response


api = FastAPI(
    title="Stress Forecast",
    openapi_url=None,
    lifespan=database_lifespan,
    exception_handlers={
        HTTPException: handle_http_error,
        RequestValidationError: handle_invalid_request,
        AIParseError: handle_ai_parse_error,
        Exception: handle_internal_error,
    },
)

api_router = APIRouter(prefix="/api")
api_router.include_router(courses.router)
api_router.include_router(student.router)
api_router.include_router(rep.router)
api.include_router(api_router)

# Wrap the application so allowed origins can read unhandled 500 responses as well.
app = APICORSMiddleware(
    api,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
