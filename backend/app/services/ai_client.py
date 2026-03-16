import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def complete_structured(
    system_prompt: str,
    user_prompt: str,
    schema: dict | None = None,
) -> dict:
    """Call the configured LLM provider and return parsed JSON."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai":
        return await _call_openai(system_prompt, user_prompt, schema)
    elif provider == "groq":
        return await _call_groq(system_prompt, user_prompt)
    elif provider == "anthropic":
        return await _call_anthropic(system_prompt, user_prompt)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


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
    return json.loads(content)


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
    )
    content = response.choices[0].message.content
    return json.loads(content)


async def _call_anthropic(system_prompt: str, user_prompt: str) -> dict:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=settings.LLM_MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    content = response.content[0].text

    # Try to extract JSON from the response
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to find JSON block in markdown
        if "```json" in content:
            json_str = content.split("```json")[1].split("```")[0].strip()
            return json.loads(json_str)
        if "```" in content:
            json_str = content.split("```")[1].split("```")[0].strip()
            return json.loads(json_str)
        raise
