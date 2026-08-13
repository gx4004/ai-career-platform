from typing import Literal

from pydantic import BaseModel


class ResultAccessDecision(BaseModel):
    """Explicit candidate-neutral decision mirrored by the frontend contract."""

    state: Literal["full"] = "full"
    treatment: Literal["control"] = "control"
    reason: Literal["policy_disabled", "no_candidate_selected"] = "policy_disabled"
    can_export: Literal[True] = True
    policy_version: Literal["control-v1"] = "control-v1"
