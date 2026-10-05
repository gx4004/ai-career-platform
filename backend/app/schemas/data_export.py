from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.applications import ApplicationsExport
from app.schemas.cv_documents import CvDocumentsExport
from app.schemas.development import DevelopmentItemResponse
from app.schemas.discovery_personalization import PersonalizationExport
from app.schemas.evidence_profile import EvidenceItemResponse
from app.schemas.gap_classification import GapClassificationRead
from app.schemas.gap_response import GapResponseOffer


class DevelopmentLoopExport(BaseModel):
    """Stored gaps/items plus exact response offers derived from those gaps.

    Recommendations remain read-only views (#200), not a redundant persistence
    layer. Exporting them makes the advice portable; deleting a classification
    removes its derived offer with no ghost recommendation row (D-114).
    """

    model_config = ConfigDict(extra="forbid")

    classification_count: int = Field(ge=0)
    classifications: list[GapClassificationRead]
    item_count: int = Field(ge=0)
    items: list[DevelopmentItemResponse]
    recommendation_count: int = Field(ge=0)
    recommendations: list[GapResponseOffer]

    @model_validator(mode="after")
    def counts_match(self):
        if self.classification_count != len(self.classifications):
            raise ValueError("classification_count must equal classifications length")
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal items length")
        if self.recommendation_count != len(self.recommendations):
            raise ValueError("recommendation_count must equal recommendations length")
        return self


class AccountExport(BaseModel):
    """The account profile (never credentials)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    email: str
    full_name: str | None = None
    created_at: datetime | None = None


class SavedRunExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tool_name: str
    label: str | None = None
    is_favorite: bool = False
    parent_run_id: str | None = None
    workspace_id: str | None = None
    feedback_text: str | None = None
    result_payload: dict
    created_at: datetime | None = None


class RunsExport(BaseModel):
    """Every saved tool run the account owns, newest last."""

    model_config = ConfigDict(extra="forbid")

    run_count: int = Field(ge=0)
    runs: list[SavedRunExport]

    @model_validator(mode="after")
    def count_matches(self):
        if self.run_count != len(self.runs):
            raise ValueError("run_count must equal runs length")
        return self


class CareerDataExport(BaseModel):
    """Portable, schema-validated export of every structured career-data store."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["career-data-export/v1"] = "career-data-export/v1"
    exported_at: datetime
    account: AccountExport | None = None
    runs: RunsExport = Field(default_factory=lambda: RunsExport(run_count=0, runs=[]))
    item_count: int = Field(ge=0)
    items: list[EvidenceItemResponse]
    cv_documents: CvDocumentsExport
    applications: ApplicationsExport
    personalization: PersonalizationExport
    development: DevelopmentLoopExport

    @model_validator(mode="after")
    def item_count_matches(self):
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal the number of exported items")
        return self
