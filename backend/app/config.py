from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./career_platform.db"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: Literal["HS256"] = "HS256"

    LLM_PROVIDER: str = "vertex"
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_PRACTICE_MODEL: str = ""
    GOOGLE_API_KEY: str = ""

    VERTEX_PROJECT_ID: str = ""
    VERTEX_LOCATION: str = "us-central1"

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    ENVIRONMENT: str = "development"
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXY_CIDRS: str = ""
    RATE_LIMIT_STORAGE_URI: str = "memory://"
    RATE_LIMIT_KEY_PREFIX: str = "career-workbench"
    ABUSE_IDENTITY_HMAC_KEY: str = ""
    MODEL_COST_LIMIT: str = "30/hour"
    MODEL_SOURCE_COST_LIMIT: str = "60/hour"
    RESOURCE_IMPORT_LIMIT: str = "60/hour"
    RESOURCE_SOURCE_LIMIT: str = "120/hour"
    AUTH_FAILURE_WINDOW_SECONDS: int = 900
    AUTH_PROGRESSIVE_DELAY_AFTER: int = 3
    AUTH_PROGRESSIVE_DELAY_CAP_SECONDS: float = 4.0
    ACCOUNT_ACTION_WINDOW_SECONDS: int = 3600
    ACCOUNT_PROGRESSIVE_DELAY_AFTER: int = 3
    ACCOUNT_PROGRESSIVE_DELAY_CAP_SECONDS: float = 2.0

    RESULT_CACHE_TTL_SECONDS: int = 3600
    RESULT_CACHE_ENABLED: bool = True
    # Entry bound for the in-process result cache (LRU eviction at the bound).
    # Measured payloads: ~2.6 KB JSON for a Resume heuristic result, ~25 KB for a
    # cover letter, ~63 KB (~84 KB resident) for a 12-question interview set —
    # the service-clamped worst case. A full 512-entry cache of those worst-case
    # payloads measured ~35 MB RSS in one Uvicorn worker (~8 MB for typical
    # payloads), while still holding a full TTL window for ~17 users running at
    # the 30/hour MODEL_COST_LIMIT.
    RESULT_CACHE_MAX_ENTRIES: int = Field(default=512, gt=0)
    BLENDED_SCORING_ENABLED: bool = True
    RESULT_ACCESS_POLICY_ENABLED: bool = False

    # ── R11 Evidence Profile injection (issue #147, D-063, ADR 0005) ──
    # Master switch for injecting confirmed profile evidence through the shared
    # pipeline. Ships dark (default False) to honor the still-open R1–R4 / R3
    # gate (D-060) and match the repo's dark-ship pattern (#144 shipped dormant,
    # R7 flags default OFF). When False, tools use today's inline-input behavior
    # with no data loss (ADR 0005); an operator enables it once the gate closes.
    # Even when True it is a no-op for guests and users with no profile items.
    EVIDENCE_PROFILE_INJECTION_ENABLED: bool = False

    # Build-ahead outcomes are code-complete but not production-authorized.
    # These server-side switches are the authoritative exposure boundary; the
    # frontend mirrors them only for navigation. Each defaults off and must be
    # activated deliberately after its accepted roadmap gate closes.
    R11_EVIDENCE_PROFILE_ENABLED: bool = False
    R12_CV_STUDIO_ENABLED: bool = False
    R13_CAMPAIGNS_ENABLED: bool = False
    R14_DISCOVERY_ENABLED: bool = False
    R15_QUEUE_ENABLED: bool = False
    R16_SUBMISSION_FOUNDATION_ENABLED: bool = False
    R17_DEVELOPMENT_LOOP_ENABLED: bool = False

    # ── R10 scaling-trigger scorecard inputs (issue #136, parent #135) ──
    # Operator-declared deployment topology class. The intended backend starts
    # one Uvicorn process, so `single` is the accurate default; declare `multi`
    # only when two or more API replicas are actually verified (D-052/ADR 0004).
    API_REPLICA_CLASS: Literal["single", "multi"] = "single"
    # Per-tool submit-to-result p95 latency budget in milliseconds. The latency
    # trigger fires only if this is sustained across consecutive daily windows.
    LATENCY_P95_BUDGET_MS: int = Field(default=60000, gt=0)
    # Provider LLM-cost alert budget over a rolling 24h window, in USD. Feeds the
    # abuse/cost trigger's cost-alert branch (D-057).
    COST_ALERT_USD_24H: float = Field(default=5.0, gt=0, allow_inf_nan=False)
    # Provisioned Postgres capacity in bytes for the storage-headroom signal;
    # 0 means "unknown" and the database trigger reports insufficient evidence
    # for storage rather than guessing (D-058).
    DB_CAPACITY_BYTES: int = Field(default=0, ge=0)

    CAPTCHA_ENABLED: bool = False
    CAPTCHA_SECRET_KEY: str = ""
    CAPTCHA_VERIFY_URL: str = "https://www.google.com/recaptcha/api/siteverify"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    RESEND_API_KEY: str = ""
    PASSWORD_RESET_FROM_EMAIL: str = "noreply@careerworkbench.com"
    PASSWORD_RESET_REPLY_TO: str = ""
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

    DISPOSABLE_EMAIL_BLOCK_ENABLED: bool = True

    SENTRY_DSN: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()


# Values a browser never sends as an `Origin`, but that read like an allowlist
# entry. `*` makes CORSMiddleware echo whatever origin asked; `null` is what
# sandboxed iframes, `file://` documents, and some redirect chains send.
_NON_ORIGIN_TOKENS = frozenset({"*", "null"})


def resolve_allowed_origins() -> list[str]:
    """Return the effective credentialed CORS allowlist.

    Single source of truth for the origin list so the startup check below and
    the CORSMiddleware registration in `app.main` cannot drift apart.
    """
    origins = [
        value.strip() for value in settings.CORS_ORIGINS.split(",") if value.strip()
    ]
    frontend = settings.FRONTEND_URL.strip()
    if frontend and frontend not in origins:
        origins.append(frontend)
    return origins


def validate_origin_config() -> None:
    """Refuse to boot outside development on an unusable origin configuration.

    `CORS_ORIGINS` and `FRONTEND_URL` are the whole browser-facing trust
    boundary: CORS runs with `allow_credentials=True`, so every entry is an
    origin allowed to drive cookie-authenticated requests, and `FRONTEND_URL`
    is additionally the redirect target for OAuth and password-reset links.
    Every failure below is silent at runtime — the browser just drops the
    response, or the allowlist quietly trusts everyone — which is why this is a
    boot refusal rather than a log line. Development stays permissive so plain
    HTTP localhost work is unaffected, matching `validate_abuse_control_config`.
    """
    if settings.ENVIRONMENT == "development":
        return

    origins = resolve_allowed_origins()
    frontend = settings.FRONTEND_URL.strip()

    # No allowlist at all: no browser origin can ever be granted credentialed
    # access, so the deployed frontend cannot call the API and both variables
    # are plainly unset rather than deliberately empty.
    if not origins:
        raise RuntimeError(
            "CORS_ORIGINS and FRONTEND_URL are both empty. Set the deployed "
            f"frontend origin before running in {settings.ENVIRONMENT}."
        )

    # An unset FRONTEND_URL is not merely a missing origin: the OAuth callback
    # and the password-reset email silently fall back to the first CORS entry
    # or to `http://localhost:3000` (`app/routers/google_auth.py`,
    # `app/routers/auth.py`), so users would receive localhost links.
    if not frontend:
        raise RuntimeError(
            "FRONTEND_URL is empty, so OAuth redirects and password-reset links "
            "fall back to a localhost URL. Set the deployed frontend origin "
            f"before running in {settings.ENVIRONMENT}."
        )

    for origin in origins:
        if origin in _NON_ORIGIN_TOKENS:
            raise RuntimeError(
                f"Origin {origin!r} grants credentialed access to any site. "
                "List the exact frontend origins in CORS_ORIGINS before running "
                f"in {settings.ENVIRONMENT}."
            )

        parts = urlsplit(origin)
        # A browser `Origin` header is exactly `scheme://host[:port]`, and
        # CORSMiddleware compares it as an exact string. An entry with no
        # scheme/host, or with a path, trailing slash, query, or fragment, can
        # never match one: it is dead configuration that reads as protection.
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise RuntimeError(
                f"Origin {origin!r} is not a browser origin. Use "
                "scheme://host[:port] with an http or https scheme before "
                f"running in {settings.ENVIRONMENT}."
            )
        if parts.path or parts.query or parts.fragment:
            raise RuntimeError(
                f"Origin {origin!r} carries a path, query, or fragment and can "
                "never match a browser Origin header. Use scheme://host[:port] "
                f"before running in {settings.ENVIRONMENT}."
            )
        # Outside development the session cookie is https-only (`app.main`) and
        # the auth cookies are `Secure` (`app/auth/security.py`), so a plain
        # HTTP origin can never receive them — the flow is broken by
        # construction, and keeping it allowlisted advertises a downgrade path.
        if parts.scheme != "https":
            raise RuntimeError(
                f"Origin {origin!r} is not https, but session and auth cookies "
                f"are Secure in {settings.ENVIRONMENT}. Use an https origin."
            )

    # FRONTEND_URL is appended to the allowlist by `app.main`. If an explicit
    # CORS_ORIGINS list exists and does not name it, the two settings disagree
    # about which site this deployment serves and the credentialed allowlist is
    # widened to an origin the operator never declared.
    declared = [
        value.strip() for value in settings.CORS_ORIGINS.split(",") if value.strip()
    ]
    if declared:
        frontend_parts = urlsplit(frontend)
        frontend_origin = (
            frontend_parts.scheme.lower(),
            frontend_parts.netloc.lower(),
        )
        declared_origins = {
            (urlsplit(value).scheme.lower(), urlsplit(value).netloc.lower())
            for value in declared
        }
        if frontend_origin not in declared_origins:
            raise RuntimeError(
                f"FRONTEND_URL {frontend!r} does not match any CORS_ORIGINS entry "
                f"({', '.join(declared)}). Declare the deployed frontend origin in "
                f"CORS_ORIGINS before running in {settings.ENVIRONMENT}."
            )
