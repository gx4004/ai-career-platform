"""In-memory scoring-mode toggle for the live admin demonstration.

Part of the comparative study reported in Chapter 4. The runtime override
defaults to the `SCORING_MODE` environment variable at process start; an admin
endpoint may flip it for the duration of the running process. The override is
intentionally *not* persisted to the database — the configuration of record is
the environment variable, and the runtime override exists solely so that the
diploma defence can demonstrate both modes without redeploying.
"""

from __future__ import annotations

import logging
from typing import Literal

from app.config import settings

logger = logging.getLogger(__name__)

ScoringMode = Literal["blended", "heuristic"]
_VALID_MODES: tuple[str, ...] = ("blended", "heuristic")

# Initialise from the configured default. Falls back to "blended" if the
# environment variable is missing or carries an unknown value.
_initial_mode: ScoringMode = "blended"
configured = getattr(settings, "SCORING_MODE", "blended")
if configured in _VALID_MODES:
    _initial_mode = configured  # type: ignore[assignment]
elif configured:
    logger.warning("Unknown SCORING_MODE=%r; defaulting to 'blended'.", configured)

_current_mode: ScoringMode = _initial_mode


def get_scoring_mode() -> ScoringMode:
    return _current_mode


def set_scoring_mode(mode: str) -> ScoringMode:
    """Set the in-memory scoring mode. Raises ValueError on unknown input."""
    global _current_mode
    if mode not in _VALID_MODES:
        raise ValueError(f"unknown scoring mode: {mode!r}; expected one of {_VALID_MODES}")
    _current_mode = mode  # type: ignore[assignment]
    logger.info("scoring mode set to %s (in-memory)", mode)
    return _current_mode


def reset_to_configured() -> ScoringMode:
    """Restore the mode from the SCORING_MODE environment variable."""
    global _current_mode
    _current_mode = _initial_mode
    return _current_mode
