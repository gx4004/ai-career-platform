"""Unit tests for the LLM provider routing in ai_client.py."""

import json
from unittest.mock import AsyncMock, Mock

import pytest

from app.services.ai_client import complete_structured

SYSTEM = "You are a helpful assistant."
USER = "Return JSON."


@pytest.fixture(autouse=True)
def _no_retry_sleep_global(monkeypatch):
    """Make asyncio.sleep a no-op inside ai_client across the whole file.

    `_with_retry` retries on (TimeoutError, RuntimeError, JSONDecodeError);
    the JSON-truncation scenarios below would otherwise sit through
    5+10+20+40s of exponential backoff between retries.
    """
    import app.services.ai_client as mod

    async def _instant(_seconds):
        return None

    monkeypatch.setattr(mod.asyncio, "sleep", _instant)


# ---------- provider routing ----------

@pytest.mark.asyncio
async def test_vertex_provider_called(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "vertex")
    monkeypatch.setattr("app.services.ai_client.settings.LLM_MODEL", "gemini-2.5-flash")
    mock = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr("app.services.ai_client._call_vertex", mock)
    result = await complete_structured(SYSTEM, USER)
    mock.assert_awaited_once_with(SYSTEM, USER, "gemini-2.5-flash")
    assert result == {"ok": True}


@pytest.mark.asyncio
async def test_unsupported_provider_raises(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "cohere")
    with pytest.raises(ValueError, match="Unsupported LLM provider: cohere"):
        await complete_structured(SYSTEM, USER)


# ---------- provider case insensitivity ----------

@pytest.mark.asyncio
async def test_provider_case_insensitive(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "Vertex")
    mock = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr("app.services.ai_client._call_vertex", mock)
    await complete_structured(SYSTEM, USER)
    mock.assert_awaited_once()


# ---------- JSON parse error ----------

@pytest.mark.asyncio
async def test_vertex_json_parse_error_after_retries_exhausts(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "vertex")
    monkeypatch.setattr("app.services.ai_client.settings.VERTEX_PROJECT_ID", "test")

    import app.services.ai_client as mod

    async def _bad_vertex(_sp, _up, _model_name=None):
        return json.loads("not valid json {{")

    monkeypatch.setattr(mod, "_call_vertex", _bad_vertex)
    with pytest.raises(json.JSONDecodeError):
        await complete_structured(SYSTEM, USER)


@pytest.mark.asyncio
async def test_with_retry_recovers_from_transient_json_decode_error(monkeypatch):
    """A truncated JSON response on the first attempt should be retried, not
    bubbled straight to the tool's heuristic fallback path."""
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "vertex")
    monkeypatch.setattr("app.services.ai_client.settings.VERTEX_PROJECT_ID", "test")

    import app.services.ai_client as mod

    call_count = 0

    async def _flaky_vertex(_sp, _up, _model_name=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise json.JSONDecodeError("Expecting value", "doc", 0)
        return {"ok": True}

    monkeypatch.setattr(mod, "_call_vertex", _flaky_vertex)
    result = await complete_structured(SYSTEM, USER)
    assert result == {"ok": True}
    assert call_count == 2


@pytest.mark.asyncio
async def test_vertex_configuration_failure_is_not_retried(monkeypatch):
    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "LLM_PROVIDER", "vertex")
    call_count = 0

    async def _misconfigured(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        raise mod.ProviderConfigurationError("AI service configuration error.")

    monkeypatch.setattr(mod, "_call_vertex", _misconfigured)

    with pytest.raises(mod.ProviderConfigurationError):
        await complete_structured(SYSTEM, USER)

    assert call_count == 1


# ---------- Vertex Google Gen AI SDK integration ----------

@pytest.mark.asyncio
async def test_vertex_uses_google_genai_sdk_and_closes_clients(monkeypatch):
    """Vertex generation must avoid the removed ``vertexai.generative_models`` API."""
    from google import genai

    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "VERTEX_PROJECT_ID", "test-project")
    monkeypatch.setattr(mod.settings, "VERTEX_LOCATION", "us-central1")

    calls = []

    class FakeModels:
        async def generate_content(self, **kwargs):
            calls.append(("generate", kwargs))
            return type("Response", (), {"text": '{"ok": true}', "usage_metadata": None})()

    class FakeAsyncClient:
        models = FakeModels()

        async def aclose(self):
            calls.append(("async-close", None))

    class FakeClient:
        aio = FakeAsyncClient()

        def close(self):
            calls.append(("close", None))

    def fake_client(**kwargs):
        calls.append(("client", kwargs))
        return FakeClient()

    monkeypatch.setattr(genai, "Client", fake_client)

    result = await mod._call_vertex(SYSTEM, USER, "gemini-2.5-flash")

    assert result == {"ok": True}
    assert calls[0] == (
        "client",
        {
            "vertexai": True,
            "project": "test-project",
            "location": "us-central1",
            "http_options": {"api_version": "v1"},
        },
    )
    assert calls[1][0] == "generate"
    assert calls[1][1]["model"] == "gemini-2.5-flash"
    assert calls[1][1]["contents"] == USER
    assert calls[1][1]["config"]["system_instruction"] == SYSTEM
    assert [call[0] for call in calls[-2:]] == ["async-close", "close"]


@pytest.mark.asyncio
async def test_vertex_maps_permission_failure_without_exposing_provider_detail(monkeypatch):
    from google import genai
    from google.genai import errors as genai_errors

    import app.services.ai_client as mod

    calls = []

    class FakeModels:
        async def generate_content(self, **_kwargs):
            raise genai_errors.ClientError(
                403,
                {"error": {"message": "billing disabled for private-project"}},
            )

    class FakeAsyncClient:
        models = FakeModels()

        async def aclose(self):
            calls.append("async-close")

    class FakeClient:
        aio = FakeAsyncClient()

        def close(self):
            calls.append("close")

    monkeypatch.setattr(genai, "Client", lambda **_kwargs: FakeClient())
    incident = Mock()
    monkeypatch.setattr(mod, "set_provider_incident", incident)

    with pytest.raises(mod.ProviderConfigurationError, match="AI service configuration error") as error:
        await mod._call_vertex(SYSTEM, USER)

    assert "private-project" not in str(error.value)
    incident.assert_called_once_with("permission")
    assert calls == ["async-close", "close"]
