import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response

from app.config import settings
from app.feature_gates import (
    require_r11_enabled,
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
from app.services.retention import (
    run_activation_prune_scheduler,
    run_discovered_listing_expiry_scheduler,
)

configure_logging()

_SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-csrf-token"}


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
    return event


if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=_scrub_sentry_event,
    )

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the recurring activation-event retention prune (D-037, #107).

    See `app.services.retention` for why an app-startup task is the chosen
    mechanism. The task is cancelled cleanly on shutdown.
    """
    prune_task = asyncio.create_task(run_activation_prune_scheduler())
    listing_expiry_task = asyncio.create_task(run_discovered_listing_expiry_scheduler())
    try:
        yield
    finally:
        prune_task.cancel()
        listing_expiry_task.cancel()
        with suppress(asyncio.CancelledError):
            await prune_task
        with suppress(asyncio.CancelledError):
            await listing_expiry_task


app = FastAPI(title="Career Workbench API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    identity_type = get_abuse_identity_type(request)
    logger.warning(
        "abuse_limit_exceeded route=%s identity_type=%s",
        request.url.path,
        identity_type,
    )
    return _rate_limit_exceeded_handler(request, exc)


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


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
    dependencies=[Depends(require_r11_enabled)],
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
