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

# Line-anchored patterns use MULTILINE "^" plus [^\S\n]* (never \s*, which also
# matches newlines): "(?:^|\n)\s*" retried a quadratic scan from every newline in
# a run of blank lines, so a 50k-newline body froze the event loop for minutes.
_LINE_START = re.IGNORECASE | re.MULTILINE

# A role label at the start of a line ("System:", "Admin:") is how a prompt fakes a
# message from the system, but it is also an ordinary resume line ("System: Linux, macOS").
# The label is neutralised (the colon becomes a dash) and the rest of the line is kept.
ROLE_LABEL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^([^\S\n]*(?:system|assistant))([^\S\n]*):", _LINE_START),
    re.compile(r"^([^\S\n]*ADMIN)([^\S\n]*):", _LINE_START),
]

_QUALIFIERS = r"(?:(?:all|any|previous|above|prior|earlier|the|your|these|those|my|of)\s+)*"

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(rf"ignore\s+{_QUALIFIERS}instructions", re.IGNORECASE),
    re.compile(rf"disregard\s+{_QUALIFIERS}instructions", re.IGNORECASE),
    re.compile(rf"forget\s+{_QUALIFIERS}instructions", re.IGNORECASE),
    re.compile(r"you are now (?:a |an )?", re.IGNORECASE),
    re.compile(r"new (?:role|persona|identity|instructions?)\s*:", re.IGNORECASE),
    re.compile(r"return (?:a )?score (?:of )?\d+", re.IGNORECASE),
    re.compile(r"always (?:return|give|output) (?:a )?(?:score|rating) (?:of )?\d+", re.IGNORECASE),
    re.compile(r"override (?:the )?(?:score|rating|result)", re.IGNORECASE),
    # Additional patterns
    re.compile(r"^[^\S\n]*\[INST\]", _LINE_START),
    re.compile(r"<\|(?:im_start|im_end|system|user|assistant)\|>", re.IGNORECASE),
    re.compile(r"^[^\S\n]*<<SYS>>", _LINE_START),
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
    # Neutralising a role label is not a detection: "System: Linux" is an ordinary resume
    # line. A genuine injection after the label is caught (and logged) by INJECTION_PATTERNS.
    for pattern in ROLE_LABEL_PATTERNS:
        cleaned = pattern.sub(r"\1\2 -", cleaned)
    for pattern in INJECTION_PATTERNS:
        if pattern.search(cleaned):
            detected = True
        cleaned = pattern.sub("", cleaned)

    if detected:
        logger.warning("Prompt injection pattern detected and stripped from user input")

    return cleaned.strip()
