import asyncio
import json
import logging
import random

from app.config import settings

logger = logging.getLogger(__name__)

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
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0


async def _with_retry(coro_factory, max_retries: int = _MAX_RETRIES, base_delay: float = _RETRY_BASE_DELAY):
    """Retry with exponential backoff: 1s -> 2s -> 4s + jitter."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_factory()
        except (TimeoutError, RuntimeError) as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    "LLM retry %d/%d after %.1fs: %s", attempt + 1, max_retries, delay, exc
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
        if provider == "openai":
            return await _call_openai(system_prompt, user_prompt, schema, model)
        elif provider == "groq":
            return await _call_groq(system_prompt, user_prompt, model)
        elif provider == "anthropic":
            return await _call_anthropic(system_prompt, user_prompt, model)
        elif provider == "vertex":
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


async def _call_openai(
    system_prompt: str, user_prompt: str, schema: dict | None, model_name: str | None = None
) -> dict:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    kwargs: dict = {
        "model": model_name or settings.LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "timeout": _LLM_TIMEOUT_SECONDS,
    }

    if schema:
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "result", "schema": schema, "strict": True},
        }
    else:
        kwargs["response_format"] = {"type": "json_object"}

    response = await client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content
    return _safe_parse_json(content, "openai")


async def _call_groq(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=settings.GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )

    response = await client.chat.completions.create(
        model=model_name or settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
        timeout=_LLM_TIMEOUT_SECONDS,
    )
    content = response.choices[0].message.content
    return _safe_parse_json(content, "groq")


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
    except asyncio.TimeoutError:
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
        logger.error("Vertex AI call failed: %s", exc)
        raise RuntimeError("AI service temporarily unavailable. Please try again.")

    content = response.text
    return _safe_parse_json(content, "vertex")


async def _call_google_genai(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from google import genai

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model_name or settings.LLM_MODEL,
        contents=user_prompt,
        config={
            "system_instruction": system_prompt,
            "temperature": 0.3,
            "response_mime_type": "application/json",
        },
    )

    content = response.text
    return _safe_parse_json(content, "google")


async def _call_anthropic(system_prompt: str, user_prompt: str, model_name: str | None = None) -> dict:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=model_name or settings.LLM_MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        timeout=_LLM_TIMEOUT_SECONDS,
    )

    content = response.content[0].text
    return _safe_parse_json(content, "anthropic")


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
            json_str = content.split("```json")[1].split("```")[0].strip()
            return json.loads(json_str)
        if "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
            return json.loads(json_str)
        logger.error(
            "Failed to parse LLM response as JSON  provider=%s  content_start=%s",
            provider,
            content[:200],
        )
        raise
