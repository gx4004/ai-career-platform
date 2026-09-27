from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy.orm import Session

from app.models.discovery_source import DiscoverySource
from app.models.user import User
from app.schemas.discovery_sources import (
    DiscoveryAllowedBehavior,
    DiscoveryQueryParameter,
    DiscoveryRobotsPolicy,
    DiscoverySourceCreate,
    DiscoverySourceFamily,
    DiscoverySourceUpdate,
)


class IngestionRefusal(StrEnum):
    UNREGISTERED = "unregistered"
    TERMS_NOT_ACCEPTED = "terms_not_accepted"
    KILL_SWITCHED = "kill_switched"
    BEHAVIOR_NOT_ALLOWED = "behavior_not_allowed"
    CONFIG_INCOMPLETE = "config_incomplete"


class SourceIngestionRefused(RuntimeError):
    def __init__(self, reason: IngestionRefusal):
        self.reason = reason
        super().__init__(reason.value)


@dataclass(frozen=True)
class SourceIngestionAuthorization:
    source_id: str
    source_key: str
    source_family: DiscoverySourceFamily
    allowed_behavior: DiscoveryAllowedBehavior
    endpoint_url: str
    allowed_query_parameters: tuple[DiscoveryQueryParameter, ...]
    robots_policy: DiscoveryRobotsPolicy
    rate_limit_per_minute: int
    attribution_rule: str
    retention_days: int

    @property
    def policy_fingerprint(self) -> tuple:
        return (
            self.source_family,
            self.allowed_behavior,
            self.endpoint_url,
            self.allowed_query_parameters,
            self.robots_policy,
            self.rate_limit_per_minute,
            self.attribution_rule,
            self.retention_days,
        )


def register_source(db: Session, body: DiscoverySourceCreate) -> DiscoverySource:
    """Register a source dark: new entries always start pending and killed."""
    source = DiscoverySource(
        **body.model_dump(),
        terms_status="pending",
        terms_reviewed_at=None,
        terms_reviewed_by=None,
        kill_switch=True,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def update_source(
    db: Session,
    source: DiscoverySource,
    body: DiscoverySourceUpdate,
    *,
    actor: User | None = None,
) -> DiscoverySource:
    changes = body.model_dump(exclude_unset=True)
    next_terms_status = changes.get("terms_status", source.terms_status)
    if "terms_status" in changes:
        if actor is None or not actor.is_admin:
            raise ValueError("Terms status changes require an authenticated admin reviewer")
        if next_terms_status == "pending":
            changes.update(terms_reviewed_at=None, terms_reviewed_by=None)
        else:
            changes.update(
                terms_reviewed_at=datetime.now(UTC),
                terms_reviewed_by=actor.id,
            )
    if changes.get("kill_switch") is False and next_terms_status != "accepted":
        raise ValueError("A source cannot activate before its terms review is accepted")

    for field, value in changes.items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return source


def operate_source_kill_switch(
    db: Session,
    source: DiscoverySource,
    *,
    tripped: bool,
    actor: User,
) -> DiscoverySource:
    """Trip or clear a source's kill switch as an immediate operator action.

    Runtime-effective: this only flips the persisted ``kill_switch`` column that
    every fetch/ingest read path re-reads via ``require_ingestion_allowed``, so a
    trip halts the next fetch with no deploy or restart. Clearing is refused
    unless the terms review is accepted (the same activation gate as
    ``update_source``), so the kill switch can never be used to bypass D-084.
    """
    if not actor.is_admin:
        raise ValueError("Kill-switch operations require an authenticated admin operator")
    if not tripped and source.terms_status != "accepted":
        raise ValueError("A source cannot activate before its terms review is accepted")
    source.kill_switch = tripped
    db.commit()
    db.refresh(source)
    return source


def require_ingestion_allowed(
    db: Session,
    source_key: str,
    behavior: DiscoveryAllowedBehavior,
) -> SourceIngestionAuthorization:
    """Return the governed source or refuse before any network or ingest work."""
    source = (
        db.query(DiscoverySource)
        .populate_existing()
        .filter(DiscoverySource.source_key == source_key)
        .first()
    )
    if source is None:
        raise SourceIngestionRefused(IngestionRefusal.UNREGISTERED)
    if source.terms_status != "accepted":
        raise SourceIngestionRefused(IngestionRefusal.TERMS_NOT_ACCEPTED)
    if source.kill_switch:
        raise SourceIngestionRefused(IngestionRefusal.KILL_SWITCHED)
    if source.allowed_behavior != behavior:
        raise SourceIngestionRefused(IngestionRefusal.BEHAVIOR_NOT_ALLOWED)
    if (
        source.endpoint_url is None
        or source.allowed_query_parameters is None
        or source.robots_policy is None
    ):
        raise SourceIngestionRefused(IngestionRefusal.CONFIG_INCOMPLETE)
    return SourceIngestionAuthorization(
        source_id=source.id,
        source_key=source.source_key,
        source_family=source.source_family,
        allowed_behavior=source.allowed_behavior,
        endpoint_url=source.endpoint_url,
        allowed_query_parameters=tuple(source.allowed_query_parameters),
        robots_policy=source.robots_policy,
        rate_limit_per_minute=source.rate_limit_per_minute,
        attribution_rule=source.attribution_rule,
        retention_days=source.retention_days,
    )
