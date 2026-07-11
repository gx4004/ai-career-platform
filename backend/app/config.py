from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./career_platform.db"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

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
    BLENDED_SCORING_ENABLED: bool = True

    # ── R11 Evidence Profile injection (issue #147, D-063, ADR 0005) ──
    # Master switch for injecting confirmed profile evidence through the shared
    # pipeline. Ships dark (default False) to honor the still-open R1–R4 / R3
    # gate (D-060) and match the repo's dark-ship pattern (#144 shipped dormant,
    # R7 flags default OFF). When False, tools use today's inline-input behavior
    # with no data loss (ADR 0005); an operator enables it once the gate closes.
    # Even when True it is a no-op for guests and users with no profile items.
    EVIDENCE_PROFILE_INJECTION_ENABLED: bool = False

    # ── R10 scaling-trigger scorecard inputs (issue #136, parent #135) ──
    # Operator-declared deployment topology class. The intended backend starts
    # one Uvicorn process, so `single` is the accurate default; declare `multi`
    # only when two or more API replicas are actually verified (D-052/ADR 0004).
    API_REPLICA_CLASS: str = "single"
    # Per-tool submit-to-result p95 latency budget in milliseconds. The latency
    # trigger fires only if this is sustained across consecutive daily windows.
    LATENCY_P95_BUDGET_MS: int = 60000
    # Provider LLM-cost alert budget over a rolling 24h window, in USD. Feeds the
    # abuse/cost trigger's cost-alert branch (D-057).
    COST_ALERT_USD_24H: float = 5.0
    # Provisioned Postgres capacity in bytes for the storage-headroom signal;
    # 0 means "unknown" and the database trigger reports insufficient evidence
    # for storage rather than guessing (D-058).
    DB_CAPACITY_BYTES: int = 0

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
