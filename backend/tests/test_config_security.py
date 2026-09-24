import pytest
from pydantic import ValidationError

from app.config import Settings, resolve_allowed_origins, validate_origin_config


def test_only_accepted_hs256_token_algorithm_is_configurable():
    assert Settings(ALGORITHM="HS256").ALGORITHM == "HS256"
    with pytest.raises(ValidationError):
        Settings(ALGORITHM="ES256")


@pytest.mark.parametrize("replica_class", ["many", "single ", ""])
def test_replica_class_rejects_unknown_topology(replica_class):
    with pytest.raises(ValidationError):
        Settings(API_REPLICA_CLASS=replica_class)


@pytest.mark.parametrize(
    "field,value",
    [
        ("LATENCY_P95_BUDGET_MS", 0),
        ("LATENCY_P95_BUDGET_MS", -1),
        ("COST_ALERT_USD_24H", 0),
        ("COST_ALERT_USD_24H", -0.01),
        ("COST_ALERT_USD_24H", float("nan")),
        ("COST_ALERT_USD_24H", float("inf")),
        ("COST_ALERT_USD_24H", float("-inf")),
        ("DB_CAPACITY_BYTES", -1),
        # A hit-ratio floor is a ratio: outside (0, 1] it can never be met or
        # missed, so the cache trigger would read as budgeted and be inert.
        ("CACHE_HIT_RATIO_FLOOR", 0),
        ("CACHE_HIT_RATIO_FLOOR", -0.1),
        ("CACHE_HIT_RATIO_FLOOR", 1.01),
        ("CACHE_HIT_RATIO_FLOOR", float("nan")),
        ("CACHE_HIT_RATIO_FLOOR", float("inf")),
        ("PROVIDER_AVAILABILITY_SLO_PCT", 0),
        ("PROVIDER_AVAILABILITY_SLO_PCT", -1.0),
        ("PROVIDER_AVAILABILITY_SLO_PCT", 100.01),
        ("PROVIDER_AVAILABILITY_SLO_PCT", float("nan")),
        ("PROVIDER_AVAILABILITY_SLO_PCT", float("inf")),
        # Below 1 the "elevation" factor would fire on abandonment that improved.
        ("LOADER_ABANDONMENT_ELEVATION_FACTOR", 0.99),
        ("LOADER_ABANDONMENT_ELEVATION_FACTOR", 0),
        ("LOADER_ABANDONMENT_ELEVATION_FACTOR", float("nan")),
        ("LOADER_ABANDONMENT_ELEVATION_FACTOR", float("inf")),
        ("DB_QUERY_P95_BUDGET_MS", 0),
        ("DB_QUERY_P95_BUDGET_MS", -1),
    ],
)
def test_scorecard_settings_reject_nonsensical_numeric_values(field, value):
    with pytest.raises(ValidationError):
        Settings(**{field: value})


def test_scorecard_settings_accept_documented_boundaries():
    settings = Settings(
        API_REPLICA_CLASS="multi",
        LATENCY_P95_BUDGET_MS=1,
        COST_ALERT_USD_24H=0.01,
        DB_CAPACITY_BYTES=0,
        CACHE_HIT_RATIO_FLOOR=1.0,
        PROVIDER_AVAILABILITY_SLO_PCT=100.0,
        LOADER_ABANDONMENT_ELEVATION_FACTOR=1.0,
        DB_QUERY_P95_BUDGET_MS=1,
    )

    assert settings.API_REPLICA_CLASS == "multi"
    assert settings.LATENCY_P95_BUDGET_MS == 1
    assert settings.COST_ALERT_USD_24H == 0.01
    assert settings.DB_CAPACITY_BYTES == 0
    assert settings.CACHE_HIT_RATIO_FLOOR == 1.0
    assert settings.PROVIDER_AVAILABILITY_SLO_PCT == 100.0
    assert settings.LOADER_ABANDONMENT_ELEVATION_FACTOR == 1.0
    assert settings.DB_QUERY_P95_BUDGET_MS == 1


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
