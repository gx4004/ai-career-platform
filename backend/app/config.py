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

    # `anthropic` provider (local dev without Vertex, or a real second provider).
    # No default model here: ai_client falls back to claude-haiku-4-5 only when
    # LLM_MODEL is still at its Vertex-shaped built-in default and no
    # model_override was passed, so an operator's explicit LLM_MODEL always wins.
    ANTHROPIC_API_KEY: str = ""

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    ENVIRONMENT: str = "development"

    RESULT_CACHE_TTL_SECONDS: int = 3600
    RESULT_CACHE_ENABLED: bool = True
    # Entry bound for the in-process result cache (LRU eviction at the bound).
    # Measured payloads: ~2.6 KB JSON for a Resume heuristic result, ~25 KB for a
    # cover letter, ~63 KB (~84 KB resident) for a 12-question interview set —
    # the service-clamped worst case. A full 512-entry cache of those worst-case
    # payloads measured ~35 MB RSS in one Uvicorn worker (~8 MB for typical
    # payloads).
    RESULT_CACHE_MAX_ENTRIES: int = Field(default=512, gt=0)
    BLENDED_SCORING_ENABLED: bool = True

    # Recurring employer-ATS ingestion (Greenhouse/Lever/Ashby public job-board
    # APIs, #323). Off by default so the always-on discovery routes never start a
    # network-fetching background loop on their own (see
    # `app.services.ats_ingestion.run_ats_ingestion_scheduler`).
    ATS_INGESTION_ENABLED: bool = False
    # Autopilot experiment (#325): opens a headed browser on the machine running
    # the backend, fills an approved application form, and stops before submit.
    # Local-only: `validate_autopilot_config` refuses it outside development.
    AUTOPILOT_EXPERIMENT_ENABLED: bool = False

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    RESEND_API_KEY: str = ""
    PASSWORD_RESET_FROM_EMAIL: str = "noreply@careerworkbench.com"
    PASSWORD_RESET_REPLY_TO: str = ""
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

    DISPOSABLE_EMAIL_BLOCK_ENABLED: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()


def resolve_allowed_origins() -> list[str]:
    """Return the effective credentialed CORS allowlist.

    `FRONTEND_URL` is appended when `CORS_ORIGINS` does not already list it.
    """
    origins = [
        value.strip() for value in settings.CORS_ORIGINS.split(",") if value.strip()
    ]
    frontend = settings.FRONTEND_URL.strip()
    if frontend and frontend not in origins:
        origins.append(frontend)
    return origins


def validate_llm_provider_config() -> None:
    """Refuse to boot outside development on the canned-fixture LLM provider.

    `LLM_PROVIDER=fake` serves deterministic demo fixtures instead of model
    output. Outside development that would silently hand users canned results,
    so it is a boot refusal.
    """
    if settings.ENVIRONMENT == "development":
        return
    if settings.LLM_PROVIDER.strip().lower() == "fake":
        raise RuntimeError(
            "LLM_PROVIDER=fake serves canned demo fixtures and is only allowed "
            f"in development, not {settings.ENVIRONMENT}."
        )


def validate_autopilot_config() -> None:
    """Refuse to boot outside development with the Autopilot experiment on.

    `AUTOPILOT_EXPERIMENT_ENABLED` launches a headed browser on the machine
    running the backend and types the owner's details into employer forms. On a
    hosted deployment that browser would run on the server, not in front of the
    owner, so it is a boot refusal.
    """
    if settings.ENVIRONMENT == "development":
        return
    if settings.AUTOPILOT_EXPERIMENT_ENABLED:
        raise RuntimeError(
            "AUTOPILOT_EXPERIMENT_ENABLED opens a browser on this machine and is "
            f"only allowed in development, not {settings.ENVIRONMENT}."
        )
