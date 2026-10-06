from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.applications import ApplicationStatus
from app.schemas.discovery_recommendations import DiscoveryListingItem
from app.services.quality_signals import BORDERLINE_MATCH_FROM

ActionReason = Literal["interview", "deadline", "no_reply"]


class ActionItem(BaseModel):
    """One application that needs the owner's attention, and why."""

    model_config = ConfigDict(extra="forbid")

    application_id: str
    title: str
    company: str | None = None
    status: ApplicationStatus
    reason: ActionReason
    deadline: datetime | None = None
    applied_at: datetime | None = None
    # Set for ``no_reply``: how long the application has been waiting.
    days_since_applied: int | None = Field(default=None, ge=0)


class TodayPlan(BaseModel):
    """What to do today: jobs worth adding, and applications that need a move."""

    model_config = ConfigDict(extra="forbid")

    # Any job board the owner can currently see listings from.
    has_sources: bool
    # Confirmed evidence exists, so skills fit can rank the matches.
    has_evidence: bool
    # Only listings at or above ``best_match_min_fit`` skills fit.
    best_matches: list[DiscoveryListingItem]
    # Filled only when no listing clears the floor: the nearest few, never called "best".
    closest_matches: list[DiscoveryListingItem] = Field(default_factory=list)
    best_match_min_fit: int = Field(default=BORDERLINE_MATCH_FROM, ge=0, le=100)
    needs_action: list[ActionItem]
    # Applications needing action, including any beyond the ones listed.
    needs_action_total: int = Field(ge=0)
