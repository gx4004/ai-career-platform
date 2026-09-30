import pytest
from pydantic import ValidationError

from app.config import (
    Settings,
    resolve_allowed_origins,
    validate_autopilot_config,
    validate_llm_provider_config,
)


def test_only_accepted_hs256_token_algorithm_is_configurable():
    assert Settings(ALGORITHM="HS256").ALGORITHM == "HS256"
    with pytest.raises(ValidationError):
        Settings(ALGORITHM="ES256")


def test_resolved_origins_trim_entries_and_append_frontend_url_once(monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.CORS_ORIGINS",
        " https://app.example.com , https://www.example.com ",
    )
    monkeypatch.setattr("app.config.settings.FRONTEND_URL", "https://app.example.com")

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


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_non_development_refuses_the_autopilot_experiment(monkeypatch, environment):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", environment)
    monkeypatch.setattr("app.config.settings.AUTOPILOT_EXPERIMENT_ENABLED", True)

    with pytest.raises(RuntimeError, match="AUTOPILOT_EXPERIMENT_ENABLED"):
        validate_autopilot_config()


@pytest.mark.parametrize(
    ("environment", "enabled"),
    [
        ("development", True),
        ("development", False),
        ("production", False),
    ],
)
def test_autopilot_config_allows_local_use_and_hosted_off(monkeypatch, environment, enabled):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", environment)
    monkeypatch.setattr("app.config.settings.AUTOPILOT_EXPERIMENT_ENABLED", enabled)

    validate_autopilot_config()
