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
    # ATS-sourced fields (#323). Null for listings ingested before these
    # fields existed, and for non-ATS sources that never populate them.
    location: str | None = None
    remote: bool | None = None
    posted_at: datetime | None = None
    apply_url: HttpsUrl | None = None
    department: str | None = None
    score: int = Field(ge=0, le=100)
    rationale: list[RecommendationSignal]
    attributions: list[RecommendationAttribution] = Field(min_length=1)

    @field_validator("posted_at")
    @classmethod
    def require_posted_at_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class DiscoveryRecommendationList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DiscoveryRecommendation]
    confirmed_item_count: int = Field(ge=0)
    preference_item_count: int = Field(ge=0)


class DiscoveryListingItem(BaseModel):
    """One searchable job listing, with a match score when the user has a profile."""

    model_config = ConfigDict(extra="forbid")

    listing_id: str
    title: str
    company: str
    description: str
    location: str | None = None
    remote: bool | None = None
    posted_at: datetime | None = None
    apply_url: HttpsUrl | None = None
    department: str | None = None
    # Null when the user has no confirmed Evidence Profile items to score against.
    score: int | None = Field(default=None, ge=0, le=100)
    matched_keywords: list[str]
    # Attribution: the job board the listing came from ("Greenhouse") and the
    # original listing link.
    source_name: str
    source_url: HttpsUrl

    @field_validator("posted_at")
    @classmethod
    def require_posted_at_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class DiscoveryListingStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobs: int = Field(ge=0)
    companies: int = Field(ge=0)
    new_this_week: int = Field(ge=0)


class DiscoveryListingPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DiscoveryListingItem]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    limit: int = Field(ge=1)
    sort: Literal["best_match", "newest"]
    has_profile: bool
    # Unfiltered totals for the page header, and the company filter options.
    stats: DiscoveryListingStats
    companies: list[str]
