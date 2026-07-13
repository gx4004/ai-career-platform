from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, UrlConstraints, field_validator

HttpsUrl = Annotated[
    AnyHttpUrl,
    UrlConstraints(allowed_schemes=["https"], max_length=2_048),
]


class RecommendationAttribution(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    source_id: str
    source_name: str
    source_family: Literal["licensed", "employer_ats", "public_career_page", "user_provided"]
    source_url: HttpsUrl
    retrieved_at: datetime

    @field_validator("retrieved_at")
    @classmethod
    def require_offset(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class RecommendationSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["confirmed_evidence", "preference"]
    label: str
    matched_keywords: list[str]
    evidence_item_ids: list[str]
    score: int = Field(ge=0, le=100)


class DiscoveryRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str
    title: str
    company: str
    description: str
    score: int = Field(ge=0, le=100)
    rationale: list[RecommendationSignal]
    attributions: list[RecommendationAttribution] = Field(min_length=1)


class DiscoveryRecommendationList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DiscoveryRecommendation]
    confirmed_item_count: int = Field(ge=0)
    preference_item_count: int = Field(ge=0)
