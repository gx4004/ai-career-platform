from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.applications import ApplicationStatus
from app.schemas.discovery_recommendations import DiscoveryListingItem

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
    best_matches: list[DiscoveryListingItem]
    needs_action: list[ActionItem]
    # Applications needing action, including any beyond the ones listed.
    needs_action_total: int = Field(ge=0)
