import asyncio
import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse, Response

from app.auth.security import dummy_password_hash
from app.config import (
    resolve_allowed_origins,
    settings,
    validate_autopilot_config,
    validate_llm_provider_config,
)
from app.database import release_scheduler_leader, try_acquire_scheduler_leader
from app.limiter import limiter, rate_limit_exceeded_handler
from app.routers import (
    admin,
    applications,
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
    portfolio,
    resume,
    telemetry,
    today,
)
from app.services.ats_ingestion import run_ats_ingestion_scheduler
from app.services.observability import configure_logging
from app.services.retention import run_discovered_listing_expiry_scheduler
from app.startup_checks import redacted_config_summary, validate_startup_config

configure_logging()
# slowapi warns on every 429 with the client address in the message, which the
# logging policy forbids (and credential stuffing would flood). The structured
# request line already records the 429.
logging.getLogger("slowapi").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)


SCHEDULER_RESTART_DELAY_SECONDS = 60.0


async def _supervise(name: str, run_scheduler) -> None:
    """Run one scheduler; a crash is logged (type only) and retried after a pause.

    A scheduler that returns normally (ATS ingestion when its flags are off) is
    finished and is not restarted. Cancellation passes through for shutdown.
    """
    while True:
        try:
            await run_scheduler()
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - supervisor must outlive any job failure
            logger.error(
                "scheduler crashed name=%s error_type=%s", name, type(exc).__name__
            )
        await asyncio.sleep(SCHEDULER_RESTART_DELAY_SECONDS)


LEADER_RETRY_SECONDS = 30.0


async def _run_schedulers_when_leader() -> None:
    """Win the scheduler leader lock, then run the supervised schedulers.

    On a rolling deploy the previous instance still holds the lock while this one
    boots, so a single attempt at start-up would leave the new instance without
    schedulers for good once the old one exits. A follower therefore retries until
    the lock frees. Cancelling this task cancels the schedulers it started.
    """
    while not await asyncio.to_thread(try_acquire_scheduler_leader):
        logger.info("scheduler leader held by another instance; retrying")
        await asyncio.sleep(LEADER_RETRY_SECONDS)
    await asyncio.gather(
        _supervise("discovered_listing_expiry", run_discovered_listing_expiry_scheduler),
        _supervise("ats_ingestion", run_ats_ingestion_scheduler),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the recurring discovered-listing expiry and ATS ingestion tasks.

    See `app.services.retention` for why an app-startup task is the chosen
    mechanism. Only the instance holding the scheduler leader lock runs them (a
    no-op on SQLite); a follower keeps trying until the lock frees. The task is
    cancelled cleanly on shutdown.
    `run_ats_ingestion_scheduler` (#323) returns immediately as a no-op when its
    own flags are off, so the task always exists but never fetches unless
    deliberately enabled.
    """
    # Warm the dummy hash now so the first unknown-email login costs the same as
    # every later one (CON-2).
    await asyncio.to_thread(dummy_password_hash)
    scheduler_task = asyncio.create_task(_run_schedulers_when_leader())
    try:
        yield
    finally:
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task
        await asyncio.to_thread(release_scheduler_leader)


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


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


JSON_BODY_LIMIT_BYTES = 1_048_576
MULTIPART_BODY_LIMIT_BYTES = 11_010_048
MAX_BODY_CHUNKS = 4_096


class RequestSizeLimitMiddleware:
    """Bound request bodies at the ASGI receive seam, before framework parsing.

    A declared Content-Length over the limit is refused up front, and a declared
    body may never deliver more than it declared. Chunked bodies carry no length,
    so received bytes and chunks are counted as they arrive. The request is
    answered 413 the moment a bound is crossed; the app is then shown a disconnect
    so it stops reading. The chunk cap applies only to chunked bodies: a slow,
    in-limit declared upload may arrive in any number of small pieces.
    """

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
        max_chunks: int | None = MAX_BODY_CHUNKS
        if raw_length is not None:
            try:
                declared = int(raw_length)
            except ValueError:
                await self._reject(send)
                return
            if declared < 0 or declared > limit:
                await self._reject(send)
                return
            limit = declared
            max_chunks = None

        received_bytes = 0
        received_chunks = 0
        response_started = False
        rejected = False

        async def counting_receive():
            nonlocal received_bytes, received_chunks, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received_chunks += 1
                received_bytes += len(message.get("body", b""))
                too_many_chunks = max_chunks is not None and received_chunks > max_chunks
                if (received_bytes > limit or too_many_chunks) and not response_started:
                    rejected = True
                    await self._reject(send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message):
            nonlocal response_started
            if rejected:
                return  # the 413 is already on the wire; drop whatever the app says next
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        await self.app(scope, counting_receive, guarded_send)

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


request_logger = logging.getLogger("app.request")

# An id a proxy or client already assigned is kept so one id follows the request
# across hops; anything else (or nothing) gets a fresh one. The shape check keeps
# arbitrary header text out of the logs.
_INCOMING_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")


def _request_id(scope) -> str:
    for name, value in scope.get("headers", []):
        if name == b"x-request-id":
            candidate = value.decode("latin-1")
            if _INCOMING_REQUEST_ID.fullmatch(candidate):
                return candidate
            break
    return uuid.uuid4().hex[:16]


class RequestLogMiddleware:
    """One structured line per request, and a catch-all for unhandled errors.

    The line holds method, path, status, duration and the request id (echoed as
    X-Request-ID): no query string (job-search terms) and no client address,
    matching the logging policy. An unhandled exception is logged by type and
    request id only, never its message or traceback, and answered with a generic
    500 whose body carries the request id so a report can be matched to the log.
    """

    _QUIET_PREFIX = "/api/v1/health"

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(scope)
        started = time.perf_counter()
        status_code = 500
        response_started = False

        async def logging_send(message):
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_started = True
                message = {
                    **message,
                    "headers": [
                        *message.get("headers", []),
                        (b"x-request-id", request_id.encode("ascii")),
                    ],
                }
            await send(message)

        try:
            await self.app(scope, receive, logging_send)
        except Exception as exc:  # noqa: BLE001 - last line of defence for the process
            request_logger.error(
                json.dumps(
                    {
                        "event": "unhandled_error",
                        "error_type": type(exc).__name__,
                        "request_id": request_id,
                    },
                    sort_keys=True,
                )
            )
            if not response_started:
                body = json.dumps(
                    {"detail": "Internal server error", "request_id": request_id}
                ).encode()
                await logging_send({
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii")),
                    ],
                })
                await send({"type": "http.response.body", "body": body})
        finally:
            path = scope.get("path", "")
            if not path.startswith(self._QUIET_PREFIX):
                request_logger.info(
                    json.dumps(
                        {
                            "event": "http_request",
                            "method": scope.get("method"),
                            "path": path,
                            "status": status_code,
                            "duration_ms": int((time.perf_counter() - started) * 1000),
                            "request_id": request_id,
                        },
                        sort_keys=True,
                    )
                )


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


class _GZipUnlessRanged(GZipMiddleware):
    """Gzip, except for Range requests: a 206 body must stay the identity bytes its Content-Range names."""

    async def __call__(self, scope, receive, send):  # type: ignore[override]
        if scope["type"] == "http" and any(name == b"range" for name, _ in scope["headers"]):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


# Innermost, so the security and request-id headers are added to the compressed
# response. JSON bodies (history, listings, CV documents) shrink several-fold.
# Level 6: level 9 costs 2-3x the CPU on the event loop for a few percent smaller JSON.
app.add_middleware(_GZipUnlessRanged, minimum_size=1000, compresslevel=6)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(RequestLogMiddleware)
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
    # Cross-origin deployments: the client reads Retry-After for rate-limit copy and logs the request id.
    expose_headers=["Retry-After", "X-Request-ID"],
)

# --- Startup checks ---
validate_startup_config(settings)
logger.info(json.dumps(redacted_config_summary(settings), sort_keys=True))
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
    applications.router,
    prefix=f"{prefix}/applications",
    tags=["applications"],
)
app.include_router(today.router, prefix=f"{prefix}/today", tags=["today"])
app.include_router(telemetry.router, prefix=f"{prefix}/telemetry", tags=["telemetry"])
app.include_router(admin.router, prefix=f"{prefix}/admin", tags=["admin"])
