"""Single server-authoritative result/export access seam for provisional R9."""

from typing import Literal

from app.config import settings
from app.schemas.access_policy import ResultAccessDecision

ResultSurface = Literal["live_result", "saved_result", "export"]


def evaluate_result_access(
    *,
    surface: ResultSurface,
    tool_name: str,
    access_mode: Literal["authenticated", "guest_demo"],
) -> ResultAccessDecision:
    """Return unchanged full access until #128/#129 select a candidate."""
    del surface, tool_name, access_mode
    return ResultAccessDecision(
        reason=(
            "no_candidate_selected"
            if settings.RESULT_ACCESS_POLICY_ENABLED
            else "policy_disabled"
        )
    )
