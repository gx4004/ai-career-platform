import pytest
from pydantic import ValidationError

from app.config import (
    Settings,
    resolve_allowed_origins,
    validate_llm_provider_config,
    validate_origin_config,
)


def test_only_accepted_hs256_token_algorithm_is_configurable():
    assert Settings(ALGORITHM="HS256").ALGORITHM == "HS256"
    with pytest.raises(ValidationError):
        Settings(ALGORITHM="ES256")




def _origin_config(monkeypatch, *, environment, cors_origins, frontend_url):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", environment)
    monkeypatch.setattr("app.config.settings.CORS_ORIGINS", cors_origins)
    monkeypatch.setattr("app.config.settings.FRONTEND_URL", frontend_url)


@pytest.mark.parametrize(
    "cors_origins,frontend_url,expected",
    [
        # Nothing configured: no browser origin can ever be granted
        # credentialed access, so the deployed frontend cannot call the API.
        ("", "", "both empty"),
        # OAuth redirects and password-reset links fall back to localhost.
        ("https://app.example.com", "", "FRONTEND_URL is empty"),
        # Credentialed wildcard: every site becomes a trusted origin.
        ("*", "https://app.example.com", "any site"),
        ("null,https://app.example.com", "https://app.example.com", "any site"),
        # Not a browser origin, so the entry can never match an Origin header.
        ("app.example.com", "https://app.example.com", "not a browser origin"),
        ("ftp://app.example.com", "https://app.example.com", "not a browser origin"),
        (
            "https://app.example.com/",
            "https://app.example.com",
            "path, query, or fragment",
        ),
        (
            "https://app.example.com/app",
            "https://app.example.com",
            "path, query, or fragment",
        ),
        # Secure cookies are never delivered to a plain HTTP origin.
        ("http://app.example.com", "http://app.example.com", "not https"),
        ("https://app.example.com", "http://app.example.com", "not https"),
        # The two settings disagree about which site this deployment serves.
        (
            "https://app.example.com",
            "https://other.example.com",
            "does not match any CORS_ORIGINS",
        ),
    ],
)
def test_non_development_refuses_unusable_origin_config(
    monkeypatch, cors_origins, frontend_url, expected
):
    _origin_config(
        monkeypatch,
        environment="production",
        cors_origins=cors_origins,
        frontend_url=frontend_url,
    )

    with pytest.raises(RuntimeError, match=expected):
        validate_origin_config()


def test_non_development_refuses_the_shipped_localhost_defaults(monkeypatch):
    _origin_config(
        monkeypatch,
        environment="production",
        cors_origins=Settings.model_fields["CORS_ORIGINS"].default,
        frontend_url=Settings.model_fields["FRONTEND_URL"].default,
    )

    with pytest.raises(RuntimeError, match="not https"):
        validate_origin_config()


@pytest.mark.parametrize(
    "cors_origins,frontend_url",
    [
        ("", ""),
        ("*", ""),
        ("http://localhost:5173,http://localhost:3000", "http://localhost:3000"),
        ("http://localhost:5173", "http://127.0.0.1:3000"),
    ],
)
def test_development_stays_permissive_for_local_origins(
    monkeypatch, cors_origins, frontend_url
):
    _origin_config(
        monkeypatch,
        environment="development",
        cors_origins=cors_origins,
        frontend_url=frontend_url,
    )

    validate_origin_config()


@pytest.mark.parametrize(
    "cors_origins,frontend_url",
    [
        ("https://app.example.com", "https://app.example.com"),
        # CORS_ORIGINS may be left empty; FRONTEND_URL alone is a usable
        # allowlist and there is then nothing to disagree with.
        ("", "https://app.example.com"),
        ("https://app.example.com,https://www.example.com", "https://www.example.com"),
        ("https://app.example.com:8443", "https://app.example.com:8443"),
    ],
)
def test_non_development_accepts_declared_https_origins(
    monkeypatch, cors_origins, frontend_url
):
    _origin_config(
        monkeypatch,
        environment="production",
        cors_origins=cors_origins,
        frontend_url=frontend_url,
    )

    validate_origin_config()


def test_resolved_origins_trim_entries_and_append_frontend_url_once(monkeypatch):
    _origin_config(
        monkeypatch,
        environment="production",
        cors_origins=" https://app.example.com , https://www.example.com ",
        frontend_url="https://app.example.com",
    )

    assert resolve_allowed_origins() == [
        "https://app.example.com",
        "https://www.example.com",
    ]

    monkeypatch.setattr("app.config.settings.FRONTEND_URL", "https://cdn.example.com")

    assert resolve_allowed_origins() == [
        "https://app.example.com",
        "https://www.example.com",
        "https://cdn.example.com",
    ]


@pytest.mark.parametrize("provider", ["fake", "FAKE", " fake "])
def test_non_development_refuses_the_fake_llm_provider(monkeypatch, provider):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.config.settings.LLM_PROVIDER", provider)

    with pytest.raises(RuntimeError, match="LLM_PROVIDER=fake"):
        validate_llm_provider_config()


@pytest.mark.parametrize(
    ("environment", "provider"),
    [
        ("development", "fake"),
        ("production", "vertex"),
        ("production", "anthropic"),
    ],
)
def test_llm_provider_config_allows_real_providers_and_local_fake(
    monkeypatch, environment, provider
):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", environment)
    monkeypatch.setattr("app.config.settings.LLM_PROVIDER", provider)

    validate_llm_provider_config()
