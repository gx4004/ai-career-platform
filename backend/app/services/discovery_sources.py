"""The discovery source registry (ADR 0008).

A source records its owner, terms review, allowed behaviour, declared rate,
attribution rule, retention and kill switch. Enforcement is one rule:
``DiscoverySource.ingestion_allowed`` (terms accepted and kill switch clear),
re-read immediately before every fetch so a tripped kill switch halts the next
fetch with no restart.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.discovery_source import DiscoverySource
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate


class SourceNotAllowedError(RuntimeError):
    """The source's terms are not accepted, or its kill switch is tripped."""


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

    Clearing is refused unless the terms review is accepted (the same activation
    gate as ``update_source``), so the kill switch can never bypass D-084.
    """
    if not actor.is_admin:
        raise ValueError("Kill-switch operations require an authenticated admin operator")
    if not tripped and source.terms_status != "accepted":
        raise ValueError("A source cannot activate before its terms review is accepted")
    source.kill_switch = tripped
    db.commit()
    db.refresh(source)
    return source


def require_ingestion_allowed(db: Session, source: DiscoverySource) -> None:
    """Re-read the source's governance state and refuse before any network work."""
    db.refresh(source)
    if not source.ingestion_allowed:
        raise SourceNotAllowedError(source.source_key)
