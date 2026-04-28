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
async def test_vertex_json_parse_error(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "vertex")
    monkeypatch.setattr("app.services.ai_client.settings.VERTEX_PROJECT_ID", "test")

    import app.services.ai_client as mod

    async def _bad_vertex(_sp, _up, _model_name=None):
        return json.loads("not valid json {{")

    monkeypatch.setattr(mod, "_call_vertex", _bad_vertex)
    with pytest.raises(json.JSONDecodeError):
        await complete_structured(SYSTEM, USER)


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
