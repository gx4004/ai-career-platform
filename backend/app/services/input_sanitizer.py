"""Input sanitization for prompt injection protection.

Defense-in-depth layer with three tiers:
1. Regex stripping of known injection patterns (this file)
2. System prompts include explicit "treat user data as raw text" guards
3. Heuristic scores are computed independently of LLM output

The regex layer is NOT a complete defense against prompt injection —
it catches naive attempts. The system prompt guards are the primary defense.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

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
    # Additional patterns
    re.compile(r"(?:^|\n)\s*\[INST\]", re.IGNORECASE),
    re.compile(r"<\|(?:im_start|im_end|system|user|assistant)\|>", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*<<SYS>>", re.IGNORECASE),
    re.compile(r"(?:pretend|act as if) you (?:are|have|were)", re.IGNORECASE),
    re.compile(r"(?:do not|don't) follow (?:your |the )?(?:rules|guidelines|instructions)", re.IGNORECASE),
]


def sanitize_user_input(text: str) -> str:
    """Remove known prompt injection patterns from user text.

    Returns the cleaned text. Does not raise — always returns a usable string.
    Logs a warning when patterns are detected for monitoring.
    """
    if not text:
        return text

    cleaned = text
    detected = False
    for pattern in INJECTION_PATTERNS:
        if pattern.search(cleaned):
            detected = True
        cleaned = pattern.sub("", cleaned)

    if detected:
        logger.warning("Prompt injection pattern detected and stripped from user input")

    return cleaned.strip()
