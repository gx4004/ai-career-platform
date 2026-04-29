import logging

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response

from app.config import settings
from app.limiter import limiter
from app.routers import (
    admin,
    auth,
    career,
    cover_letter,
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
)
from app.services.observability import configure_logging

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
    user = event.get("user")
    if isinstance(user, dict):
        user.pop("email", None)
        user.pop("ip_address", None)
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

app = FastAPI(title="Career Workbench API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
app.include_router(telemetry.router, prefix=f"{prefix}/telemetry", tags=["telemetry"])
app.include_router(admin.router, prefix=f"{prefix}/admin", tags=["admin"])
