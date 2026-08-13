import pytest
from pydantic import ValidationError

from app.config import Settings


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
    )

    assert settings.API_REPLICA_CLASS == "multi"
    assert settings.LATENCY_P95_BUDGET_MS == 1
    assert settings.COST_ALERT_USD_24H == 0.01
    assert settings.DB_CAPACITY_BYTES == 0
