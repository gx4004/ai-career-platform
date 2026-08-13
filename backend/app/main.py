import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import sentry_sdk
from fastapi import Depends, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.feature_gates import (
    require_r12_enabled,
    require_r14_enabled,
    require_r15_enabled,
    require_r16_enabled,
    require_r17_enabled,
)
from app.limiter import (
    get_abuse_identity_type,
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
    submission_authorizations,
    telemetry,
)
from app.services.observability import configure_logging
from app.services.rate_limit_events import (
    collect_rate_limit_evidence,
    rate_limit_route_family,
)
from app.services.retention import (
    run_activation_prune_scheduler,
    run_database_sample_scheduler,
    run_discovered_listing_expiry_scheduler,
)

configure_logging()

_SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-csrf-token"}
SENTRY_TRACES_SAMPLE_RATE = 0.0


def _strip_query(value: str) -> str:
    cuts = [value.find(ch) for ch in ("?", "#")]
    candidates = [c for c in cuts if c >= 0]
    return value[: min(candidates)] if candidates else value


def _scrub_sentry_event(event, _hint):
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("cookies", None)
        request.pop("query_string", None)
        url = request.get("url")
        if isinstance(url, str):
            request["url"] = _strip_query(url)
        headers = request.get("headers")
        if isinstance(headers, dict):
            for key in list(headers.keys()):
                if key.lower() in _SENSITIVE_HEADERS:
                    headers[key] = "[scrubbed]"
    event.pop("user", None)
    for key in ("message", "logentry", "contexts", "extra", "breadcrumbs"):
        event.pop(key, None)
    exception = event.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        if isinstance(values, list):
            for value in values:
                if not isinstance(value, dict):
                    continue
                value["value"] = "[scrubbed]"
                stacktrace = value.get("stacktrace")
                if not isinstance(stacktrace, dict):
                    continue
                frames = stacktrace.get("frames")
                if isinstance(frames, list):
                    for frame in frames:
                        if isinstance(frame, dict):
                            frame.pop("vars", None)
    return event


if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        include_local_variables=False,
        before_send=_scrub_sentry_event,
    )

logger = logging.getLogger(__name__)
_rate_limit_evidence_tasks: set[asyncio.Task] = set()
RATE_LIMIT_EVIDENCE_MAX_TASKS = 64


def schedule_rate_limit_evidence(*, route_family: str, identity_type: str) -> None:
    """Collect coalesced evidence off-loop with bounded task bookkeeping."""
    if len(_rate_limit_evidence_tasks) >= RATE_LIMIT_EVIDENCE_MAX_TASKS:
        logger.warning("rate_limit_evidence_dropped reason=task_capacity")
        return
    task = asyncio.create_task(
        asyncio.to_thread(
            collect_rate_limit_evidence,
            route_family=route_family,
            identity_type=identity_type,
        )
    )
    _rate_limit_evidence_tasks.add(task)
    task.add_done_callback(_rate_limit_evidence_tasks.discard)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the recurring activation-event retention prune (D-037, #107).

    See `app.services.retention` for why an app-startup task is the chosen
    mechanism. The task is cancelled cleanly on shutdown.
    """
    prune_task = asyncio.create_task(run_activation_prune_scheduler())
    listing_expiry_task = asyncio.create_task(run_discovered_listing_expiry_scheduler())
    database_sample_task = asyncio.create_task(run_database_sample_scheduler())
    try:
        yield
    finally:
        prune_task.cancel()
        listing_expiry_task.cancel()
        database_sample_task.cancel()
        with suppress(asyncio.CancelledError):
            await prune_task
        with suppress(asyncio.CancelledError):
            await listing_expiry_task
        with suppress(asyncio.CancelledError):
            await database_sample_task


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


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    identity_type = get_abuse_identity_type(request)
    route_family = rate_limit_route_family(request.url.path)
    try:
        schedule_rate_limit_evidence(
            route_family=route_family,
            identity_type=identity_type,
        )
    except Exception as error:  # defensive: evidence must not replace the 429
        logger.warning(
            "rate_limit_evidence_schedule_failed error_type=%s",
            type(error).__name__,
        )
    return _rate_limit_exceeded_handler(request, exc)


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


JSON_BODY_LIMIT_BYTES = 1_048_576
MULTIPART_BODY_LIMIT_BYTES = 11_010_048
# Bound middleware bookkeeping even when a peer emits endless empty/tiny ASGI
# frames. Normal servers deliver request bodies in much larger chunks.
REQUEST_BODY_MAX_CHUNKS = 4_096


class RequestSizeLimitMiddleware:
    """Reject oversized request bodies before Starlette parses or buffers them."""

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

        buffered = []
        size = 0
        chunk_count = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            chunk_count += 1
            if chunk_count > REQUEST_BODY_MAX_CHUNKS:
                await self._reject(send)
                return
            size += len(message.get("body", b""))
            if size > limit:
                await self._reject(send)
                return
            buffered.append(message)
            if not message.get("more_body", False):
                break

        messages = iter(buffered)

        async def replay_receive():
            return next(messages, {"type": "http.disconnect"})

        await self.app(scope, replay_receive, send)

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
_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in _origins:
    _origins.append(settings.FRONTEND_URL)
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
    dependencies=[Depends(require_r12_enabled)],
)
app.include_router(
    development.router,
    prefix=f"{prefix}/development-plan",
    tags=["development"],
    dependencies=[Depends(require_r17_enabled)],
)
app.include_router(
    discovery.router,
    prefix=f"{prefix}/discovery",
    tags=["discovery"],
    dependencies=[Depends(require_r14_enabled)],
)
app.include_router(
    queue_rules.router,
    prefix=f"{prefix}/queue",
    tags=["queue"],
    dependencies=[Depends(require_r15_enabled)],
)
app.include_router(
    packets.router,
    prefix=f"{prefix}/packets",
    tags=["packets"],
    dependencies=[Depends(require_r15_enabled)],
)
app.include_router(
    submission_authorizations.router,
    prefix=f"{prefix}/submission-authorizations",
    tags=["submission-authorizations"],
    dependencies=[Depends(require_r16_enabled)],
)
app.include_router(telemetry.router, prefix=f"{prefix}/telemetry", tags=["telemetry"])
app.include_router(admin.router, prefix=f"{prefix}/admin", tags=["admin"])
