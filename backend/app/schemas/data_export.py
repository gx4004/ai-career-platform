from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.application_packets import ApplicationPacketsExport
from app.schemas.cv_documents import CvDocumentsExport
from app.schemas.discovery_personalization import PersonalizationExport
from app.schemas.evidence_profile import EvidenceItemResponse
from app.schemas.history import CampaignsExport
from app.schemas.queue_rules import QueueRulesExport


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

    @model_validator(mode="after")
    def item_count_matches(self):
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal the number of exported items")
        return self
