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


@pytest.mark.asyncio
async def test_vertex_constructor_auth_failure_is_safe_and_not_retried(monkeypatch):
    from google import genai
    from google.auth import exceptions as auth_exceptions

    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "LLM_PROVIDER", "vertex")
    attempts = 0
    incident = Mock()

    def missing_credentials(**_kwargs):
        nonlocal attempts
        attempts += 1
        raise auth_exceptions.DefaultCredentialsError("private credential detail")

    monkeypatch.setattr(genai, "Client", missing_credentials)
    monkeypatch.setattr(mod, "set_provider_incident", incident)

    with pytest.raises(mod.ProviderConfigurationError) as error:
        await complete_structured(SYSTEM, USER)

    assert attempts == 1
    assert "private credential detail" not in str(error.value)
    incident.assert_called_once_with("permission")


@pytest.mark.asyncio
async def test_vertex_refresh_auth_failure_is_safe_and_not_retried(monkeypatch):
    from google import genai
    from google.auth import exceptions as auth_exceptions

    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "LLM_PROVIDER", "vertex")
    attempts = 0
    closed = []

    class FakeModels:
        async def generate_content(self, **_kwargs):
            raise auth_exceptions.RefreshError("private refresh detail")

    class FakeAsyncClient:
        models = FakeModels()

        async def aclose(self):
            closed.append("async")

    class FakeClient:
        aio = FakeAsyncClient()

        def close(self):
            closed.append("sync")

    def fake_client(**_kwargs):
        nonlocal attempts
        attempts += 1
        return FakeClient()

    monkeypatch.setattr(genai, "Client", fake_client)

    with pytest.raises(mod.ProviderConfigurationError) as error:
        await complete_structured(SYSTEM, USER)

    assert attempts == 1
    assert "private refresh detail" not in str(error.value)
    assert closed == ["async", "sync"]


@pytest.mark.asyncio
async def test_vertex_transport_failure_retries_and_records_an_incident(monkeypatch):
    """A network-level provider outage must retry and leave #138 evidence.

    ``google-genai`` does not wrap httpx transport failures into ``APIError``, so
    without an explicit catch an unreachable provider escaped as a raw
    ``httpx.ConnectError``: never retried and never recorded as a provider
    incident, leaving the D-055 fallback trigger blind to real outages.
    """
    import httpx
    from google import genai

    import app.services.ai_client as mod

    monkeypatch.setattr(mod.settings, "LLM_PROVIDER", "vertex")
    monkeypatch.setattr(mod.settings, "VERTEX_PROJECT_ID", "test-project")

    attempts = 0
    incidents = []
    monkeypatch.setattr(mod, "set_provider_incident", incidents.append)

    class FakeModels:
        async def generate_content(self, **_kwargs):
            nonlocal attempts
            attempts += 1
            raise httpx.ConnectError("connection refused to 10.0.0.1")

    class FakeAsyncClient:
        models = FakeModels()

        async def aclose(self):
            return None

    class FakeClient:
        aio = FakeAsyncClient()

        def close(self):
            return None

    monkeypatch.setattr(genai, "Client", lambda **_kwargs: FakeClient())

    with pytest.raises(RuntimeError) as error:
        await complete_structured(SYSTEM, USER)

    # Retried like any other transient provider failure, then surfaced safely.
    assert attempts == 5
    assert incidents == ["unavailable"] * 5
    assert "AI service temporarily unavailable" in str(error.value)
    # The raw transport detail never reaches the user-facing message.
    assert "10.0.0.1" not in str(error.value)


# ---------- fake provider (LLM_PROVIDER=fake, local demo without Vertex) ----------


@pytest.mark.asyncio
async def test_fake_provider_dispatches_to_fake_llm_registry(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "fake")
    mock = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr("app.services.fake_llm.fake_complete_structured", mock)
    result = await complete_structured(SYSTEM, USER)
    mock.assert_awaited_once_with(SYSTEM, USER)
    assert result == {"ok": True}


@pytest.mark.asyncio
async def test_fake_provider_unmatched_prompt_raises_and_is_not_retried(monkeypatch):
    """An unrecognized prompt is a fixture-coverage gap, not a transient fault.

    Bare ``ValueError`` is the same "never recovers from a retry" category as
    the unsupported-provider branch, so one call, no backoff.
    """
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "fake")
    with pytest.raises(ValueError, match="no registered fixture"):
        await complete_structured("Some prompt with no known marker.", USER)


# ---------- anthropic provider ----------


class _FakeAnthropicTextBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class _FakeAnthropicUsage:
    def __init__(self, input_tokens: int = 100, output_tokens: int = 40):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeAnthropicResponse:
    def __init__(self, text: str = '{"ok": true}', usage=None):
        self.content = [_FakeAnthropicTextBlock(text)]
        self.usage = usage if usage is not None else _FakeAnthropicUsage()


class _FakeAnthropicMessages:
    def __init__(self, response=None, error: Exception | None = None):
        self._response = response
        self._error = error
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class _FakeAsyncAnthropic:
    """Stand-in for ``anthropic.AsyncAnthropic`` — no real network call."""

    def __init__(self, response=None, error: Exception | None = None, **init_kwargs):
        self.init_kwargs = init_kwargs
        self.messages = _FakeAnthropicMessages(response, error)
        self.closed = False

    async def close(self):
        self.closed = True


def _anthropic_status_error(cls, status_code: int, message: str = "error"):
    import httpx2

    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status_code, request=request)
    return cls(message, response=response, body=None)


def _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client):
    """Patch ``anthropic.AsyncAnthropic`` to return `fake_client`, capturing the
    constructor kwargs `_call_anthropic` passed onto it."""

    def _factory(**kwargs):
        fake_client.init_kwargs = kwargs
        return fake_client

    monkeypatch.setattr(anthropic_sdk, "AsyncAnthropic", _factory)


@pytest.mark.asyncio
async def test_anthropic_provider_called(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr("app.services.ai_client.settings.LLM_MODEL", "claude-sonnet-5")

    fake_client = _FakeAsyncAnthropic(response=_FakeAnthropicResponse('{"ok": true}'))
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    result = await complete_structured(SYSTEM, USER)

    assert result == {"ok": True}
    assert fake_client.init_kwargs["api_key"] == "sk-ant-test"
    # A single retry policy: `_with_retry` above already backs off, so the SDK's
    # own retries must be disabled to avoid retrying the same failure twice.
    assert fake_client.init_kwargs["max_retries"] == 0
    call = fake_client.messages.calls[0]
    assert call["model"] == "claude-sonnet-5"
    assert call["system"] == SYSTEM
    assert call["messages"] == [{"role": "user", "content": USER}]
    assert fake_client.closed is True


@pytest.mark.asyncio
async def test_anthropic_default_model_is_haiku_when_llm_model_not_customized(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")
    # LLM_MODEL left at its Vertex-shaped built-in default ("gemini-2.5-flash").

    fake_client = _FakeAsyncAnthropic(response=_FakeAnthropicResponse())
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    await complete_structured(SYSTEM, USER)

    assert fake_client.messages.calls[0]["model"] == "claude-haiku-4-5"


@pytest.mark.asyncio
async def test_anthropic_explicit_llm_model_overrides_the_haiku_default(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr("app.services.ai_client.settings.LLM_MODEL", "claude-opus-5")

    fake_client = _FakeAsyncAnthropic(response=_FakeAnthropicResponse())
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    await complete_structured(SYSTEM, USER)

    assert fake_client.messages.calls[0]["model"] == "claude-opus-5"


@pytest.mark.asyncio
async def test_anthropic_model_override_param_wins_over_default(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    fake_client = _FakeAsyncAnthropic(response=_FakeAnthropicResponse())
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    await complete_structured(SYSTEM, USER, model_override="claude-sonnet-5")

    assert fake_client.messages.calls[0]["model"] == "claude-sonnet-5"


@pytest.mark.asyncio
async def test_anthropic_missing_api_key_is_a_configuration_error_not_retried(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "")

    attempts = 0

    def _unexpected_construction(**_kwargs):
        nonlocal attempts
        attempts += 1
        raise AssertionError("client must not be constructed without an API key")

    monkeypatch.setattr(anthropic_sdk, "AsyncAnthropic", _unexpected_construction)

    import app.services.ai_client as mod

    with pytest.raises(mod.ProviderConfigurationError):
        await complete_structured(SYSTEM, USER)

    assert attempts == 0


@pytest.mark.asyncio
async def test_anthropic_authentication_error_maps_to_configuration_error_not_retried(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-bad")

    error = _anthropic_status_error(anthropic_sdk.AuthenticationError, 401, "invalid x-api-key")
    fake_client = _FakeAsyncAnthropic(error=error)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    import app.services.ai_client as mod

    incidents: list[str] = []
    monkeypatch.setattr(mod, "set_provider_incident", incidents.append)

    with pytest.raises(mod.ProviderConfigurationError, match="AI service configuration error") as excinfo:
        await complete_structured(SYSTEM, USER)

    assert len(fake_client.messages.calls) == 1
    assert incidents == ["permission"]
    assert "invalid x-api-key" not in str(excinfo.value)
    assert fake_client.closed is True


@pytest.mark.asyncio
async def test_anthropic_permission_denied_error_maps_to_configuration_error(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    error = _anthropic_status_error(anthropic_sdk.PermissionDeniedError, 403, "model not permitted")
    fake_client = _FakeAsyncAnthropic(error=error)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    import app.services.ai_client as mod

    with pytest.raises(mod.ProviderConfigurationError):
        await complete_structured(SYSTEM, USER)

    assert len(fake_client.messages.calls) == 1


@pytest.mark.asyncio
async def test_anthropic_rate_limit_error_is_retried_as_runtimeerror(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    error = _anthropic_status_error(anthropic_sdk.RateLimitError, 429, "rate limited")
    fake_client = _FakeAsyncAnthropic(error=error)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    import app.services.ai_client as mod

    incidents: list[str] = []
    monkeypatch.setattr(mod, "set_provider_incident", incidents.append)

    with pytest.raises(RuntimeError, match="AI service quota exceeded"):
        await complete_structured(SYSTEM, USER)

    # Retried like Vertex's ResourceExhausted/429 branch.
    assert len(fake_client.messages.calls) == 5
    assert incidents == ["quota"] * 5


@pytest.mark.asyncio
async def test_anthropic_server_error_is_retried_as_runtimeerror(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    error = _anthropic_status_error(anthropic_sdk.InternalServerError, 500, "server error")
    fake_client = _FakeAsyncAnthropic(error=error)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    with pytest.raises(RuntimeError, match="AI service temporarily unavailable"):
        await complete_structured(SYSTEM, USER)

    assert len(fake_client.messages.calls) == 5


@pytest.mark.asyncio
async def test_anthropic_connection_error_is_retried_and_hides_transport_detail(monkeypatch):
    import anthropic as anthropic_sdk
    import httpx2

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic_sdk.APIConnectionError(message="connection refused to 10.0.0.1", request=request)
    fake_client = _FakeAsyncAnthropic(error=error)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    with pytest.raises(RuntimeError) as excinfo:
        await complete_structured(SYSTEM, USER)

    assert len(fake_client.messages.calls) == 5
    assert "AI service temporarily unavailable" in str(excinfo.value)
    assert "10.0.0.1" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_anthropic_records_usage_through_the_shared_cost_accumulator(monkeypatch):
    import anthropic as anthropic_sdk

    from app.services import llm_cost

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr("app.services.ai_client.settings.LLM_MODEL", "claude-sonnet-5")

    llm_cost.reset_llm_cost()
    usage = _FakeAnthropicUsage(input_tokens=1000, output_tokens=200)
    fake_client = _FakeAsyncAnthropic(response=_FakeAnthropicResponse('{"ok": true}', usage=usage))
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    await complete_structured(SYSTEM, USER)

    total = llm_cost._llm_cost_total.get()
    assert total == llm_cost.estimate_cost("claude-sonnet-5", 1000, 200)


@pytest.mark.asyncio
async def test_anthropic_concatenates_only_text_blocks(monkeypatch):
    import anthropic as anthropic_sdk

    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "anthropic")
    monkeypatch.setattr("app.services.ai_client.settings.ANTHROPIC_API_KEY", "sk-ant-test")

    response = _FakeAnthropicResponse('{"a": 1}')
    non_text_block = type("ThinkingBlock", (), {"type": "thinking", "thinking": "..."})()
    response.content = [non_text_block, _FakeAnthropicTextBlock('{"a": 1}')]
    fake_client = _FakeAsyncAnthropic(response=response)
    _install_fake_anthropic_client(monkeypatch, anthropic_sdk, fake_client)

    result = await complete_structured(SYSTEM, USER)

    assert result == {"a": 1}
