"""Input sanitization for prompt injection protection.

Strips known injection patterns from user-provided text before it reaches
the LLM. This is a defense-in-depth layer — system prompts also include
guards, and heuristic scores are computed independently of the LLM.
"""

from __future__ import annotations

import re

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?:^|\n)\s*(?:system|assistant)\s*:", re.IGNORECASE),
    re.compile(r"ignore (?:all |previous |above |prior )?instructions", re.IGNORECASE),
    re.compile(r"disregard (?:all |previous |above |prior )?instructions", re.IGNORECASE),
    re.compile(r"forget (?:all |previous |above |prior )?instructions", re.IGNORECASE),
    re.compile(r"you are now (?:a |an )?", re.IGNORECASE),
    re.compile(r"new (?:role|persona|identity|instructions?)\s*:", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*ADMIN\s*:", re.IGNORECASE),
    re.compile(r"return (?:a )?score (?:of )?\d+", re.IGNORECASE),
    re.compile(r"always (?:return|give|output) (?:a )?(?:score|rating) (?:of )?\d+", re.IGNORECASE),
    re.compile(r"override (?:the )?(?:score|rating|result)", re.IGNORECASE),
]


def sanitize_user_input(text: str) -> str:
    """Remove known prompt injection patterns from user text.

    Returns the cleaned text. Does not raise — always returns a usable string.
    """
    if not text:
        return text

    cleaned = text
    for pattern in INJECTION_PATTERNS:
        cleaned = pattern.sub("", cleaned)

    return cleaned.strip()
