from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.application_packets import (
    ApplicationPacketsExport,
    PacketApprovalSnapshotsExport,
    PacketStopAnswersExport,
)
from app.schemas.cv_documents import CvDocumentsExport
from app.schemas.development import DevelopmentItemResponse
from app.schemas.discovery_personalization import PersonalizationExport
from app.schemas.evidence_profile import EvidenceItemResponse
from app.schemas.gap_classification import GapClassificationRead
from app.schemas.gap_response import GapResponseOffer
from app.schemas.history import CampaignsExport
from app.schemas.queue_audit import QueueAuditExport
from app.schemas.queue_rules import QueueRulesExport
from app.schemas.submission_authorizations import SubmissionAuthorizationsExport


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


class CareerDataExport(BaseModel):
    """Portable, schema-validated export of every structured career-data store."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["career-data-export/v1"] = "career-data-export/v1"
    exported_at: datetime
    item_count: int = Field(ge=0)
    items: list[EvidenceItemResponse]
    cv_documents: CvDocumentsExport
    campaigns: CampaignsExport
    personalization: PersonalizationExport
    queue_rules: QueueRulesExport
    application_packets: ApplicationPacketsExport
    packet_stop_answers: PacketStopAnswersExport
    packet_approval_snapshots: PacketApprovalSnapshotsExport
    queue_audit: QueueAuditExport
    submission_authorizations: SubmissionAuthorizationsExport
    development: DevelopmentLoopExport

    @model_validator(mode="after")
    def item_count_matches(self):
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal the number of exported items")
        return self
