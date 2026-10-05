from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, UrlConstraints, field_validator

HttpsUrl = Annotated[
    AnyHttpUrl,
    UrlConstraints(allowed_schemes=["https"], max_length=2_048),
]


# How many listing keywords a skills fit rests on: "low" is fewer than four
# (the fit is padded to four, so it never reads as a near-certain match), "high"
# is six or more.
FitConfidence = Literal["low", "medium", "high"]


class SimilarApplications(BaseModel):
    """How the owner's own similar applications went (#417): x of n got a reply.

    Similar means the same kind of role and skills-fit bucket. A separate signal,
    never blended into skills fit.
    """

    model_config = ConfigDict(extra="forbid")

    role_family: str
    fit_bucket: str
    applied: int = Field(ge=1)
    replied: int = Field(ge=0)


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
    # Also null when the listing names no skills at all (matched and missing are
    # then both empty): there is nothing to compare, which is not a 0% fit.
    skills_fit: int | None = Field(default=None, ge=0, le=100)
    fit_confidence: FitConfidence | None = None
    matched_skills: list[str]
    missing_skills: list[str]
    # Confirmed preference keywords this listing mentions; a separate signal.
    preference_hits: list[str]
    # The owner's own outcomes for similar applications; null below the
    # sample thresholds. Independent of skills_fit.
    similar_applications: SimilarApplications | None = None
    # The owner's application for this listing when they already added it.
    application_id: str | None = None
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


class HiddenListingItem(BaseModel):
    """A listing the owner hid from Discovery, with when they hid it."""

    model_config = ConfigDict(extra="forbid")

    listing_id: str
    title: str
    company: str
    location: str | None = None
    remote: bool | None = None
    posted_at: datetime | None = None
    hidden_at: datetime

    @field_validator("posted_at", "hidden_at")
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class HiddenListingPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Newest hidden first, capped; total counts every hidden listing still allowed.
    items: list[HiddenListingItem]
    total: int = Field(ge=0)
