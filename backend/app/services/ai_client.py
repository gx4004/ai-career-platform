import asyncio
import json
import logging
import random

from app.config import settings
from app.services.llm_cost import record_llm_usage

logger = logging.getLogger(__name__)


def _record_usage(response: object, model: str) -> None:
    """Record a provider response's actual token usage for R6 cost estimation.

    Reads the `usage_metadata` both Vertex and google-genai attach to a
    response (`prompt_token_count` / `candidates_token_count`). Best effort:
    cost instrumentation must never break a tool run, so any missing field or
    unexpected shape is swallowed — the run simply carries no cost from this
    call.
    """
    try:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        output_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        record_llm_usage(
            model=model,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
        )
    except Exception:  # noqa: BLE001 — usage capture is best-effort telemetry
        logger.debug("LLM usage capture skipped model=%s", model, exc_info=True)

# ---------------------------------------------------------------------------
# Lazy Vertex AI singleton
# ---------------------------------------------------------------------------
_vertex_initialised = False


def _ensure_vertex_init() -> None:
    global _vertex_initialised
    if _vertex_initialised:
        return
    import vertexai

    vertexai.init(
        project=settings.VERTEX_PROJECT_ID,
        location=settings.VERTEX_LOCATION,
    )
    _vertex_initialised = True
    logger.info(
        "Vertex AI initialised  project=%s  location=%s",
        settings.VERTEX_PROJECT_ID,
        settings.VERTEX_LOCATION,
    )


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

_LLM_TIMEOUT_SECONDS = 120
_MAX_RETRIES = 4
_RETRY_BASE_DELAY = 5.0


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

    logger.info("LLM request  provider=%s  model=%s", provider, model)

    async def _dispatch():
        if provider == "vertex":
            return await _call_vertex(system_prompt, user_prompt, model)
        elif provider == "google":
            return await _call_google_genai(system_prompt, user_prompt, model)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")

    result = await _with_retry(_dispatch)

    logger.info("LLM response provider=%s  model=%s  keys=%s", provider, model, list(result.keys()))
    return result


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------


async def _call_vertex(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from google.api_core import exceptions as gcp_exceptions
    from vertexai.generative_models import GenerationConfig, GenerativeModel

    _ensure_vertex_init()

    model = GenerativeModel(
        model_name or settings.LLM_MODEL,
        system_instruction=[system_prompt],
    )

    generation_config = GenerationConfig(
        temperature=0.3,
        response_mime_type="application/json",
    )

    try:
        response = await asyncio.wait_for(
            model.generate_content_async(
                user_prompt,
                generation_config=generation_config,
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.error("Vertex AI request timed out after %ds", _LLM_TIMEOUT_SECONDS)
        raise TimeoutError(
            f"AI request timed out after {_LLM_TIMEOUT_SECONDS}s. Please try again."
        )
    except gcp_exceptions.ResourceExhausted:
        logger.error("Vertex AI quota exceeded")
        raise RuntimeError(
            "AI service quota exceeded. Please try again in a few minutes."
        )
    except gcp_exceptions.PermissionDenied:
        logger.error(
            "Vertex AI permission denied for project=%s", settings.VERTEX_PROJECT_ID
        )
        raise RuntimeError("AI service configuration error. Please contact support.")
    except gcp_exceptions.GoogleAPICallError as exc:
        logger.error("Vertex AI call failed error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.")

    # Record actual token usage before parsing: the tokens were consumed even if
    # the JSON body later fails to parse (R6 cost estimate, issue #106).
    _record_usage(response, model_name or settings.LLM_MODEL)

    content = response.text
    return _safe_parse_json(content, "vertex")


async def _call_google_genai(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from google import genai

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

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
        )
    except Exception as exc:
        logger.error("Google AI call failed error_type=%s", type(exc).__name__)
        raise RuntimeError("AI service temporarily unavailable. Please try again.")

    # Record actual token usage before parsing: the tokens were consumed even if
    # the JSON body later fails to parse (R6 cost estimate, issue #106).
    _record_usage(response, model_name or settings.LLM_MODEL)

    content = response.text
    return _safe_parse_json(content, "google")


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------


def _safe_parse_json(content: str | None, provider: str) -> dict:
    """Parse LLM response text into a dict, with markdown-fence fallback."""
    if not content:
        logger.error("LLM returned empty content  provider=%s", provider)
        raise ValueError(f"LLM provider '{provider}' returned empty content")

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
