"""R17 honest-response offer schemas (#200, D-110/D-111).

For one classified gap (#198) there is exactly one truthful response (D-110); this
offer describes it read-only. #200 never writes to the Evidence Profile — the
capture proposal is the body the user would submit to the existing R11 create
path, and the recommendation is advisory with disclosed sourcing (D-111).
"""

from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, UrlConstraints

from app.schemas.development import DevelopmentResponseKind
from app.schemas.evidence_profile import EvidenceItemCreate
from app.schemas.gap_classification import GapKind

HttpsUrl = Annotated[
    AnyHttpUrl,
    UrlConstraints(allowed_schemes=["https"], max_length=2_048),
]

#: How the user acts on the offer. #200 itself performs none of these — it only
#: names the honest path so the caller routes to the right existing surface.
GapActionPath = Literal["reviewer_reword", "evidence_profile_create", "advisory"]


class GapRecommendationSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    url: HttpsUrl | None = None


class GapResponseOffer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gap_classification_id: str
    gap_kind: GapKind
    response_kind: DevelopmentResponseKind
    action_path: GapActionPath
    headline: str
    detail: str
    # Populated only for capture_evidence: the suggested unconfirmed item body the
    # user submits to the R11 evidence-profile create path. #200 never persists it.
    capture_proposal: EvidenceItemCreate | None = None
    # Populated for produce_evidence / learn_skill: disclosed sources (may be empty
    # — never fabricated) and an explicit "no undisclosed commercial relationship"
    # marker (D-111).
    sources: list[GapRecommendationSource] = []
    commercial_relationship: Literal["none"] = "none"
