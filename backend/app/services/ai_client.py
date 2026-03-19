import asyncio
import json
import logging

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


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

_LLM_TIMEOUT_SECONDS = 120


async def complete_structured(
    system_prompt: str,
    user_prompt: str,
    schema: dict | None = None,
) -> dict:
    """Call the configured LLM provider and return parsed JSON."""
    provider = settings.LLM_PROVIDER.lower()
    model = settings.LLM_MODEL

    logger.info("LLM request  provider=%s  model=%s", provider, model)

    if provider == "openai":
        result = await _call_openai(system_prompt, user_prompt, schema)
    elif provider == "groq":
        result = await _call_groq(system_prompt, user_prompt)
    elif provider == "anthropic":
        result = await _call_anthropic(system_prompt, user_prompt)
    elif provider == "vertex":
        result = await _call_vertex(system_prompt, user_prompt)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

    logger.info("LLM response provider=%s  model=%s  keys=%s", provider, model, list(result.keys()))
    return result


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------


async def _call_openai(
    system_prompt: str, user_prompt: str, schema: dict | None
) -> dict:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    kwargs: dict = {
        "model": settings.LLM_MODEL,
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


async def _call_groq(system_prompt: str, user_prompt: str) -> dict:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=settings.GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )

    response = await client.chat.completions.create(
        model=settings.LLM_MODEL,
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


async def _call_vertex(system_prompt: str, user_prompt: str) -> dict:
    from vertexai.generative_models import GenerationConfig, GenerativeModel

    _ensure_vertex_init()

    model = GenerativeModel(
        settings.LLM_MODEL,
        system_instruction=[system_prompt],
    )

    generation_config = GenerationConfig(
        temperature=0.3,
        response_mime_type="application/json",
    )

    response = await asyncio.wait_for(
        asyncio.to_thread(
            model.generate_content,
            user_prompt,
            generation_config=generation_config,
        ),
        timeout=_LLM_TIMEOUT_SECONDS,
    )

    content = response.text
    return _safe_parse_json(content, "vertex")


async def _call_anthropic(system_prompt: str, user_prompt: str) -> dict:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=settings.LLM_MODEL,
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
