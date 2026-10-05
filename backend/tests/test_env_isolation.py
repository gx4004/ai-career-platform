"""The suite must not see the developer's backend/.env.

backend/.env turns on the ATS ingestion scheduler and the headed Autopilot
browser. A test run that picks those up hangs or opens browsers, so conftest
pins every setting to its built-in default before the app is imported.
"""

from pathlib import Path

from dotenv import dotenv_values

from app.config import Settings, settings

DEV_ENV = Path(__file__).resolve().parents[1] / ".env"


def test_background_workers_are_off_for_the_shared_settings():
    assert settings.ATS_INGESTION_ENABLED is False
    assert settings.AUTOPILOT_EXPERIMENT_ENABLED is False


def test_a_fresh_settings_object_does_not_read_the_developer_env(monkeypatch):
    # Even when the process runs from backend/ (where `.env` is found), a new
    # Settings() must equal the built-in defaults, not the developer's values.
    monkeypatch.chdir(DEV_ENV.parent)
    fresh = Settings()
    assert fresh.ATS_INGESTION_ENABLED is False
    assert fresh.AUTOPILOT_EXPERIMENT_ENABLED is False
    assert fresh.model_dump() == Settings(_env_file=None).model_dump()


def test_every_developer_env_key_is_neutralised_for_tests():
    if not DEV_ENV.exists():
        return
    dev_keys = {k for k, v in dotenv_values(DEV_ENV).items() if v is not None}
    defaults = Settings(_env_file=None).model_dump()
    leaked = [
        key
        for key in dev_keys & set(defaults)
        if getattr(settings, key) != defaults[key]
    ]
    assert leaked == []
