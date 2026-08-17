from typing import Literal

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
