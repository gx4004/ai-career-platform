import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse, Response

from app.config import (
    resolve_allowed_origins,
    settings,
    validate_autopilot_config,
    validate_llm_provider_config,
)
from app.limiter import (
    limiter,
    validate_abuse_control_config,
)
from app.routers import (
    admin,
    auth,
    career,
    cover_letter,
    cv_documents,
    development,
    discovery,
    evidence_profile,
    files,
    google_auth,
    health,
    history,
    interview,
    job_match,
    job_posts,
    packets,
    portfolio,
    queue_rules,
    resume,
    telemetry,
)
from app.services.ats_ingestion import run_ats_ingestion_scheduler
from app.services.observability import configure_logging
from app.services.retention import (
    run_activation_prune_scheduler,
    run_discovered_listing_expiry_scheduler,
)

configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the recurring activation-event retention prune (D-037, #107).

    See `app.services.retention` for why an app-startup task is the chosen
    mechanism. The task is cancelled cleanly on shutdown. `run_ats_ingestion_scheduler`
    (#323) follows the same pattern but returns immediately as a no-op when its
    own flags are off, so the task always exists but never fetches unless
    deliberately enabled.
    """
    prune_task = asyncio.create_task(run_activation_prune_scheduler())
    listing_expiry_task = asyncio.create_task(run_discovered_listing_expiry_scheduler())
    ats_ingestion_task = asyncio.create_task(run_ats_ingestion_scheduler())
    try:
        yield
    finally:
        prune_task.cancel()
        listing_expiry_task.cancel()
        ats_ingestion_task.cancel()
        with suppress(asyncio.CancelledError):
            await prune_task
        with suppress(asyncio.CancelledError):
            await listing_expiry_task
        with suppress(asyncio.CancelledError):
            await ats_ingestion_task


app = FastAPI(title="Career Workbench API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter


async def request_validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    # FastAPI's default handler echoes the invalid input. Besides reflecting
    # passwords, that response cannot itself be UTF-8 encoded when JSON contains
    # an escaped lone surrogate. Keep the useful location/type/message contract
    # without returning user-provided values or exception contexts.
    errors = [
        {key: value for key, value in error.items() if key not in {"input", "ctx", "url"}}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": errors},
    )


app.add_exception_handler(RequestValidationError, request_validation_error_handler)


app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


JSON_BODY_LIMIT_BYTES = 1_048_576
MULTIPART_BODY_LIMIT_BYTES = 11_010_048


class RequestSizeLimitMiddleware:
    """Reject request bodies whose declared Content-Length exceeds the limit."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_type = headers.get(b"content-type", b"").decode("latin-1").lower()
        limit = (
            MULTIPART_BODY_LIMIT_BYTES
            if content_type.startswith("multipart/form-data")
            else JSON_BODY_LIMIT_BYTES
        )
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                if int(raw_length) > limit:
                    await self._reject(send)
                    return
            except ValueError:
                await self._reject(send)
                return

        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(send):
        body = b'{"detail":"Request body is too large"}'
        await send({
            "type": "http.response.start",
            "status": status.HTTP_413_CONTENT_TOO_LARGE,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})


# --- Security headers ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    https_only=settings.ENVIRONMENT != "development",
)

# --- CORS ---
_origins = resolve_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# --- Startup checks ---
_DEFAULT_SECRET = "change-me-to-a-random-secret-key"
if settings.SECRET_KEY == _DEFAULT_SECRET and settings.ENVIRONMENT != "development":
    raise RuntimeError(
        f"SECRET_KEY is the default placeholder. "
        f"Set a strong random value before running in {settings.ENVIRONMENT}. "
        f"Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

validate_abuse_control_config()
validate_llm_provider_config()
validate_autopilot_config()

if settings.LLM_PROVIDER.lower() == "vertex" and not settings.VERTEX_PROJECT_ID:
    logger.critical(
        "LLM_PROVIDER is 'vertex' but VERTEX_PROJECT_ID is empty! "
        "AI tool endpoints will fail."
    )

prefix = "/api/v1"

app.include_router(health.router, prefix=prefix)
app.include_router(auth.router, prefix=f"{prefix}/auth", tags=["auth"])
app.include_router(google_auth.router, prefix=f"{prefix}/auth/google", tags=["auth"])
app.include_router(files.router, prefix=f"{prefix}/files", tags=["files"])
app.include_router(job_posts.router, prefix=f"{prefix}/job-posts", tags=["job-posts"])
app.include_router(resume.router, prefix=f"{prefix}/resume", tags=["resume"])
app.include_router(job_match.router, prefix=f"{prefix}/job-match", tags=["job-match"])
app.include_router(
    cover_letter.router, prefix=f"{prefix}/cover-letter", tags=["cover-letter"]
)
app.include_router(
    interview.router, prefix=f"{prefix}/interview", tags=["interview"]
)
app.include_router(career.router, prefix=f"{prefix}/career", tags=["career"])
app.include_router(
    portfolio.router, prefix=f"{prefix}/portfolio", tags=["portfolio"]
)
app.include_router(history.router, prefix=f"{prefix}/history", tags=["history"])
app.include_router(
    evidence_profile.router,
    prefix=f"{prefix}/evidence-profile",
    tags=["evidence-profile"],
)
app.include_router(
    cv_documents.router,
    prefix=f"{prefix}/cv-documents",
    tags=["cv-documents"],
)
app.include_router(
    development.router,
    prefix=f"{prefix}/development-plan",
    tags=["development"],
)
app.include_router(
    discovery.router,
    prefix=f"{prefix}/discovery",
    tags=["discovery"],
)
app.include_router(
    queue_rules.router,
    prefix=f"{prefix}/queue",
    tags=["queue"],
)
app.include_router(
    packets.router,
    prefix=f"{prefix}/packets",
    tags=["packets"],
)
app.include_router(telemetry.router, prefix=f"{prefix}/telemetry", tags=["telemetry"])
app.include_router(admin.router, prefix=f"{prefix}/admin", tags=["admin"])
