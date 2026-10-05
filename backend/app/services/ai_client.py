import asyncio
import json
import logging
import random
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import HTTPException

from app.config import Settings, settings

logger = logging.getLogger(__name__)


class ProviderConfigurationError(RuntimeError):
    """A provider configuration fault that cannot recover through request retries."""


class LLMBusyError(HTTPException):
    """No model slot freed up within the bounded wait: a friendly 503, never retried."""

    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            detail="The AI service is busy right now. Please try again in a moment.",
            headers={"Retry-After": "15"},
        )


# ---------------------------------------------------------------------------
# Backpressure: a process-wide cap on in-flight provider calls
# ---------------------------------------------------------------------------

# (loop, capacity, semaphore). A semaphore belongs to one event loop, and the
# capacity is a setting, so rebuild when either changes. Calls already holding a
# slot release the semaphore they acquired.
_slots: tuple[asyncio.AbstractEventLoop, int, asyncio.Semaphore] | None = None


def _get_slots() -> asyncio.Semaphore:
    global _slots
    loop = asyncio.get_running_loop()
    capacity = settings.LLM_MAX_CONCURRENT_CALLS
    if _slots is None or _slots[0] is not loop or _slots[1] != capacity:
        _slots = (loop, capacity, asyncio.Semaphore(capacity))
    return _slots[2]


@asynccontextmanager
async def _model_slot() -> AsyncIterator[None]:
    """Hold one provider slot for a single attempt (not across retry backoff)."""
    slots = _get_slots()
    try:
        await asyncio.wait_for(slots.acquire(), timeout=settings.LLM_QUEUE_WAIT_SECONDS)
    except TimeoutError:
        logger.warning("LLM busy: no provider slot within %.1fs", settings.LLM_QUEUE_WAIT_SECONDS)
        raise LLMBusyError() from None
    try:
        yield
    finally:
        slots.release()


# ---------------------------------------------------------------------------
# One provider client per process
# ---------------------------------------------------------------------------

# name -> (config key, client). A fresh genai client reloads credentials and
# refreshes the OAuth token and opens new TLS connections on every call, so the
# client is built lazily and reused; per-call timeouts stay on each request. The
# key holds the settings the client was built from, so a changed setting builds a
# new one.
_clients: dict[str, tuple[tuple, Any]] = {}


def _cached_client(name: str, key: tuple, build) -> Any:
    entry = _clients.get(name)
    if entry is not None and entry[0] == key:
        return entry[1]
    client = build()
    _clients[name] = (key, client)
    return client


async def _discard_client(name: str, client: Any) -> None:
    """Drop (and close) a client after a credential failure so the next call re-auths."""
    entry = _clients.get(name)
    if entry is not None and entry[1] is client:
        del _clients[name]
    if client is None:
        return
    async_client = getattr(client, "aio", None)
    if async_client is not None:
        with suppress(Exception):
            await async_client.aclose()
    with suppress(Exception):
        result = client.close()
        if asyncio.iscoroutine(result):
            await result


async def close_cached_clients() -> None:
    """Close every cached provider client (process shutdown)."""
    for name, (_key, client) in list(_clients.items()):
        await _discard_client(name, client)


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

_LLM_TIMEOUT_SECONDS = 120
_MAX_RETRIES = 4
_RETRY_BASE_DELAY = 5.0

# claude-haiku-4-5 default for the `anthropic` provider (issue: local dev
# without Vertex). `settings.LLM_MODEL`'s own field default is Vertex-shaped
# ("gemini-2.5-flash"), so it is not a usable anthropic model id — applied
# only when the caller passed no model_override and the operator never
# customized LLM_MODEL away from that built-in default, so an explicit
# LLM_MODEL/LLM_PRACTICE_MODEL always wins per the usual override rule.
_ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5"


async def _with_retry(coro_factory, max_retries: int = _MAX_RETRIES, base_delay: float = _RETRY_BASE_DELAY):
    """Retry with exponential backoff: 5s -> 10s -> 20s -> 40s + jitter.

    JSONDecodeError is retried because Vertex occasionally truncates JSON
    under load. Bare ValueError is intentionally NOT retried — `_dispatch`
    raises ValueError("Unsupported LLM provider: ...") as a config error
    that will never recover from a retry; bouncing it through 75 seconds
    of backoff just delays the user-visible failure.
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_factory()
        except ProviderConfigurationError:
            raise
        except (TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 2.0)
                logger.warning(
                    "LLM retry %d/%d after %.1fs error_type=%s",
                    attempt + 1,
                    max_retries,
                    delay,
                    type(exc).__name__,
                )
                await asyncio.sleep(delay)
    raise last_exc  # type: ignore[misc]


async def complete_structured(
    system_prompt: str,
    user_prompt: str,
    schema: dict | None = None,
    model_override: str | None = None,
) -> dict:
    """Call the configured LLM provider and return parsed JSON."""
    provider = settings.LLM_PROVIDER.lower()
    model = model_override or settings.LLM_MODEL
    if (
        provider == "anthropic"
        and not model_override
        and settings.LLM_MODEL == Settings.model_fields["LLM_MODEL"].default
    ):
        model = _ANTHROPIC_DEFAULT_MODEL

    logger.info("LLM request  provider=%s  model=%s", provider, model)

    async def _dispatch():
        async with _model_slot():
            if provider == "vertex":
                return await _call_vertex(system_prompt, user_prompt, model)
            elif provider == "google":
                return await _call_google_genai(system_prompt, user_prompt, model)
            elif provider == "anthropic":
                return await _call_anthropic(system_prompt, user_prompt, model)
            elif provider == "fake":
                return await _call_fake(system_prompt, user_prompt, model)
            else:
                raise ValueError(f"Unsupported LLM provider: {provider}")

    result = await _with_retry(_dispatch)
    logger.info("LLM response provider=%s  model=%s  keys=%s", provider, model, list(result.keys()))
    return result


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------


async def _call_vertex(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from google import genai
    from google.auth import exceptions as auth_exceptions
    from google.genai import errors as genai_errors

    # ``vertexai.generative_models`` was removed after 2026-06-24. Use the
    # supported Google Gen AI SDK against the stable Vertex API while preserving
    # Application Default Credentials and the existing project/location config.
    client = None
    try:
        client = _cached_client(
            "vertex",
            (settings.VERTEX_PROJECT_ID, settings.VERTEX_LOCATION),
            lambda: genai.Client(
                vertexai=True,
                project=settings.VERTEX_PROJECT_ID,
                location=settings.VERTEX_LOCATION,
                http_options={"api_version": "v1"},
            ),
        )
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name or settings.LLM_MODEL,
                contents=user_prompt,
                config={
                    "system_instruction": system_prompt,
                    "temperature": 0.3,
                    "response_mime_type": "application/json",
                },
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.error("Vertex AI request timed out after %ds", _LLM_TIMEOUT_SECONDS)
        raise TimeoutError(
            f"AI request timed out after {_LLM_TIMEOUT_SECONDS}s. Please try again."
        ) from None
    except genai_errors.ClientError as exc:
        if exc.code == 429:
            logger.error("Vertex AI quota exceeded")
            raise RuntimeError(
                "AI service quota exceeded. Please try again in a few minutes."
            ) from None
        if exc.code in {401, 403}:
            logger.error(
                "Vertex AI permission denied for project=%s", settings.VERTEX_PROJECT_ID
            )
            await _discard_client("vertex", client)
            raise ProviderConfigurationError(
                "AI service configuration error. Please contact support."
            ) from None
        logger.error("Vertex AI call failed status=%d", exc.code)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None
    except auth_exceptions.GoogleAuthError as exc:
        logger.error("Vertex AI credentials unavailable error_type=%s", type(exc).__name__)
        await _discard_client("vertex", client)
        raise ProviderConfigurationError(
            "AI service configuration error. Please contact support."
        ) from None
    except genai_errors.ServerError as exc:
        logger.error("Vertex AI call failed error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None
    except Exception as exc:  # noqa: BLE001 — transport failures have no SDK type
        # The Gen AI SDK does not wrap httpx transport failures (DNS, TLS, refused
        # connection, reset) into an APIError, so an unreachable provider escaped
        # as a raw httpx error with no retry. The removed `GoogleAPICallError` base
        # class used to cover these. Only the error type is logged.
        logger.error("Vertex AI transport failure error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None

    content = response.text
    return _safe_parse_json(content, "vertex")


def _is_credential_failure(exc: Exception) -> bool:
    from google.auth import exceptions as auth_exceptions
    from google.genai import errors as genai_errors

    if isinstance(exc, auth_exceptions.GoogleAuthError):
        return True
    return isinstance(exc, genai_errors.ClientError) and exc.code in {401, 403}


async def _call_google_genai(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from google import genai

    client = _cached_client(
        "google",
        (settings.GOOGLE_API_KEY,),
        lambda: genai.Client(api_key=settings.GOOGLE_API_KEY),
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model_name or settings.LLM_MODEL,
                contents=user_prompt,
                config={
                    "system_instruction": system_prompt,
                    "temperature": 0.3,
                    "response_mime_type": "application/json",
                    "thinking_config": {"thinking_budget": 0},
                },
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.error("Google AI request timed out after %ds", _LLM_TIMEOUT_SECONDS)
        raise TimeoutError(
            f"AI request timed out after {_LLM_TIMEOUT_SECONDS}s. Please try again."
        ) from None
    except Exception as exc:
        logger.error("Google AI call failed error_type=%s", type(exc).__name__)
        if _is_credential_failure(exc):
            # Drop the client so the next attempt re-authenticates. Still a
            # retryable RuntimeError: this provider's retry policy is unchanged.
            await _discard_client("google", client)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None

    content = response.text
    return _safe_parse_json(content, "google")


async def _call_anthropic(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    import anthropic

    if not settings.ANTHROPIC_API_KEY:
        logger.error("Anthropic API key is not configured")
        raise ProviderConfigurationError(
            "AI service configuration error. Please contact support."
        )

    # max_retries=0: `_with_retry` above is the single retry policy for every
    # provider (5s->10s->20s->40s + jitter); letting the SDK's own default
    # retries (2, on 429/5xx/connection errors) run underneath it would retry
    # the same transient failure twice, under two different backoff schedules.
    client = _cached_client(
        "anthropic",
        (settings.ANTHROPIC_API_KEY,),
        lambda: anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=0),
    )
    model = model_name or settings.LLM_MODEL or _ANTHROPIC_DEFAULT_MODEL
    # Vertex/Google get response_mime_type="application/json" as a hard
    # enforcement; the Messages API has no equivalent, so the JSON-only
    # instruction is appended here instead of trusting every caller's own
    # prompt wording. 16000: the interview payload alone can run ~63 KB
    # (app/config.py's RESULT_CACHE_MAX_ENTRIES comment) — an 8K cap would
    # truncate it mid-object into a JSONDecodeError that `_with_retry` then
    # retries against the same truncation for no benefit.
    json_only_system = system_prompt + "\n\nOutput only the JSON object. No prose, no code fences."
    try:
        response = await asyncio.wait_for(
            client.messages.create(
                model=model,
                max_tokens=16000,
                system=json_only_system,
                messages=[{"role": "user", "content": user_prompt}],
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.error("Anthropic request timed out after %ds", _LLM_TIMEOUT_SECONDS)
        raise TimeoutError(
            f"AI request timed out after {_LLM_TIMEOUT_SECONDS}s. Please try again."
        ) from None
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        # Most-specific-first: both subclass APIStatusError, so they must be
        # caught ahead of it. Same mapping as Vertex's 401/403 ClientError
        # branch — an unrecoverable config fault, never retried.
        logger.error("Anthropic auth/permission failure error_type=%s", type(exc).__name__)
        await _discard_client("anthropic", client)
        raise ProviderConfigurationError(
            "AI service configuration error. Please contact support."
        ) from None
    except anthropic.RateLimitError:
        logger.error("Anthropic rate limit exceeded")
        raise RuntimeError(
            "AI service quota exceeded. Please try again in a few minutes."
        ) from None
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic call failed status=%s", exc.status_code)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None
    except anthropic.APIConnectionError as exc:
        logger.error("Anthropic connection failure error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None
    except Exception as exc:  # noqa: BLE001 — an unmapped SDK/transport failure
        logger.error("Anthropic transport failure error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.") from None

    content = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    return _safe_parse_json(content, "anthropic")


async def _call_fake(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    """`LLM_PROVIDER=fake` — deterministic local-demo fixtures, no network call.

    See `app/services/fake_llm.py` for the per-caller fixture registry.
    """
    from app.services.fake_llm import fake_complete_structured

    return await fake_complete_structured(system_prompt, user_prompt)


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------


def _safe_parse_json(content: str | None, provider: str) -> dict:
    """Parse LLM response text into a dict, with markdown-fence fallback."""
    if not content:
        logger.error("LLM returned empty content  provider=%s", provider)
        # Raised as RuntimeError,
        # not ValueError, so `_with_retry` treats an empty response as the
        # transient provider fault it is — bare ValueError is reserved for the
        # unsupported-provider configuration error, which never recovers.
        raise RuntimeError(f"LLM provider '{provider}' returned empty content")

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code fences
        if "```json" in content:
            parts = content.split("```json")
            if len(parts) > 1:
                json_str = parts[1].split("```")[0].strip()
                return json.loads(json_str)
        if "```" in content:
            parts = content.split("```")
            if len(parts) > 1:
                json_str = parts[1].split("```")[0].strip()
                return json.loads(json_str)
        logger.error("Failed to parse LLM response as JSON provider=%s", provider)
        raise
