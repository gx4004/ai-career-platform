"""Unit tests for the LLM provider routing in ai_client.py."""

import json
from unittest.mock import AsyncMock

import pytest

from app.services.ai_client import complete_structured

SYSTEM = "You are a helpful assistant."
USER = "Return JSON."


@pytest.fixture(autouse=True)
def _reset_vertex_singleton():
    """Reset the lazy-init flag between tests."""
    import app.services.ai_client as mod
    mod._vertex_initialised = False
    yield
    mod._vertex_initialised = False


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


# ---------- vertex lazy init ----------

def test_ensure_vertex_init_calls_vertexai_init_only_once(monkeypatch):
    """The lazy-init guard in `_ensure_vertex_init` must skip the second call.

    The previous test in this slot manually toggled the `_vertex_initialised`
    flag and asserted the toggle worked, which passed for the wrong reason.
    This version mocks `vertexai.init` itself and counts how many times the
    real codepath invokes it across two consecutive calls.
    """
    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "VERTEX_PROJECT_ID", "test-project")
    monkeypatch.setattr(mod.settings, "VERTEX_LOCATION", "us-central1")

    call_count = 0

    def fake_init(**_kwargs):
        nonlocal call_count
        call_count += 1

    fake_vertexai = type("FakeVertexAI", (), {"init": staticmethod(fake_init)})
    monkeypatch.setitem(__import__("sys").modules, "vertexai", fake_vertexai)

    mod._vertex_initialised = False
    mod._ensure_vertex_init()
    mod._ensure_vertex_init()

    assert call_count == 1, "vertexai.init must be called exactly once"
    assert mod._vertex_initialised is True
