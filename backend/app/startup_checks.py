"""Boot-time configuration validation and a redacted config summary.

A missing hosted variable should stop the deploy, not produce a green but
insecure or non-functional service: cookies without Secure, reset links that
point at localhost, or every model call failing after its retries. The checks
collect every problem so one failed boot names all of them.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from urllib.parse import urlparse

from app.config import Settings

# Derived, not copied, so the boot check follows the model default if it changes.
DEFAULT_SECRET_KEY = Settings.model_fields["SECRET_KEY"].default

# Variables a hosted platform sets. Railway is the deployment target; a service
# that sees one of these but runs as ENVIRONMENT=development was misconfigured.
_HOSTED_PLATFORM_VARIABLES = ("RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME")

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "0.0.0.0"})

_PROVIDER_CREDENTIAL = {
    "vertex": "VERTEX_PROJECT_ID",
    "google": "GOOGLE_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


def _is_local_origin(origin: str) -> bool:
    host = (urlparse(origin if "//" in origin else f"//{origin}").hostname or "").lower()
    return host in _LOCAL_HOSTS or host.endswith(".localhost")


def validate_startup_config(
    cfg: Settings, environ: Mapping[str, str] | None = None
) -> None:
    """Raise ``RuntimeError`` listing every configuration problem, or return."""
    environ = os.environ if environ is None else environ
    problems: list[str] = []

    hosted_marker = next((name for name in _HOSTED_PLATFORM_VARIABLES if environ.get(name)), None)
    if cfg.ENVIRONMENT == "development":
        if hosted_marker:
            problems.append(
                f"ENVIRONMENT is 'development' but {hosted_marker} is set: this is a hosted "
                "deployment. Set ENVIRONMENT=production so cookies are Secure and the "
                "hosted checks apply."
            )
        _raise_if(problems)
        return

    if cfg.SECRET_KEY == DEFAULT_SECRET_KEY:
        problems.append(
            "SECRET_KEY is the default placeholder. Generate one with: "
            "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )
    if _is_local_origin(cfg.FRONTEND_URL):
        problems.append(
            "FRONTEND_URL points at localhost; password-reset links would be unusable."
        )
    local_origins = [
        origin.strip()
        for origin in cfg.CORS_ORIGINS.split(",")
        if origin.strip() and _is_local_origin(origin.strip())
    ]
    if local_origins:
        problems.append("CORS_ORIGINS lists localhost origins; set the real site origin(s).")

    provider = cfg.LLM_PROVIDER.strip().lower()
    credential = _PROVIDER_CREDENTIAL.get(provider)
    if credential and not getattr(cfg, credential):
        problems.append(
            f"LLM_PROVIDER is '{provider}' but {credential} is empty; every model call would fail."
        )
    if not cfg.RESEND_API_KEY:
        problems.append("RESEND_API_KEY is empty; password-reset emails would never be sent.")

    _raise_if(problems, environment=cfg.ENVIRONMENT)


def _raise_if(problems: list[str], environment: str = "development") -> None:
    if problems:
        details = "\n".join(f"  - {problem}" for problem in problems)
        raise RuntimeError(f"Refusing to start ({environment}); fix the configuration:\n{details}")


def redacted_config_summary(cfg: Settings) -> dict[str, object]:
    """Operator-facing facts about the running config; never a secret or a URL."""
    return {
        "event": "startup_config",
        "environment": cfg.ENVIRONMENT,
        "secure_cookies": cfg.ENVIRONMENT != "development",
        "database": "sqlite" if cfg.DATABASE_URL.startswith("sqlite") else "postgresql",
        "llm_provider": cfg.LLM_PROVIDER.strip().lower(),
        "llm_model": cfg.LLM_MODEL,
        "llm_credentials_configured": bool(
            getattr(cfg, _PROVIDER_CREDENTIAL.get(cfg.LLM_PROVIDER.strip().lower(), ""), "")
        ),
        "resend_configured": bool(cfg.RESEND_API_KEY),
        "google_sign_in_configured": bool(cfg.GOOGLE_CLIENT_ID and cfg.GOOGLE_CLIENT_SECRET),
        "frontend_is_local": _is_local_origin(cfg.FRONTEND_URL),
        "ats_ingestion_enabled": cfg.ATS_INGESTION_ENABLED,
        "autopilot_enabled": cfg.AUTOPILOT_EXPERIMENT_ENABLED,
    }
