from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, UrlConstraints, field_validator

HttpsUrl = Annotated[
    AnyHttpUrl,
    UrlConstraints(allowed_schemes=["https"], max_length=2_048),
]


class DiscoveryListingItem(BaseModel):
    """One searchable job listing, with a match score when the user has a profile."""

    model_config = ConfigDict(extra="forbid")

    listing_id: str
    title: str
    company: str
    # The first few hundred characters of the description; the full text comes
    # from the detail endpoint.
    preview: str
    location: str | None = None
    remote: bool | None = None
    posted_at: datetime | None = None
    apply_url: HttpsUrl | None = None
    department: str | None = None
    # Skills fit: null when the user has no confirmed evidence to compare against.
    skills_fit: int | None = Field(default=None, ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
    # Confirmed preference keywords this listing mentions; a separate signal.
    preference_hits: list[str]
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


class DiscoveryDeepMatch(BaseModel):
    """The Job Match run linked to one listing (its own LLM score, not the feed's)."""

    model_config = ConfigDict(extra="forbid")

    history_id: str
    match_score: int = Field(ge=0, le=100)
    verdict: str | None = None
    created_at: datetime


class DiscoveryListingDetail(DiscoveryListingItem):
    """One listing with its full description (opened card, tailoring)."""

    description: str
    deep_match: DiscoveryDeepMatch | None = None


class DiscoveryListingPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DiscoveryListingItem]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    limit: int = Field(ge=1)
    sort: Literal["best_match", "newest"]
    # True when the user has confirmed evidence, so skills fit can be shown.
    has_evidence: bool
    # Company filter options across every visible listing; page 1 only.
    companies: list[str] | None = None
