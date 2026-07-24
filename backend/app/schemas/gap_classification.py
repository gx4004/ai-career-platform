"""R17 gap-classification schemas (D-109).

A gap classification labels one advisory reviewer finding as exactly one of four
explainable kinds. The kind is derived deterministically from the finding's own
category and trace plus the user's Evidence Profile state — never from a second,
parallel judgment of the materials (D-109, D-082). Every classification renders
the cited trace that produced it so a user can see *why* it was labeled.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

#: The four honest gap kinds (D-109). Each maps to exactly one truthful response
#: in R17 #200; the mapping never offers rewording for a substance gap (D-110).
GapKind = Literal[
    "presentation_weakness",
    "uncaptured_evidence",
    "evidence_not_yet_produced",
    "missing_skill",
]


class GapClassificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    workspace_id: str
    finding_id: str
    source_category: str
    gap_kind: GapKind
    message: str
    locations: list[str]
    cited_trace: list[str]
    created_at: datetime


class GapClassificationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["gap-classification/v1"] = "gap-classification/v1"
    classifications: list[GapClassificationRead]
