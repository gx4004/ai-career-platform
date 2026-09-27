from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.discovered_listing import DiscoveredListing
from app.models.discovery_personalization import DiscoveryDismissedListing
from app.schemas.discovery_personalization import DismissalItem, PersonalizationExport


class DiscoveredListingNotFoundError(Exception):
    """The referenced discovered listing does not exist."""


def _dismissal(db: Session, user_id: str, listing_id: str) -> DiscoveryDismissedListing | None:
    return (
        db.query(DiscoveryDismissedListing)
        .filter(
            DiscoveryDismissedListing.user_id == user_id,
            DiscoveryDismissedListing.listing_id == listing_id,
        )
        .one_or_none()
    )


def dismiss_recommendation(db: Session, user_id: str, listing_id: str) -> DismissalItem:
    listing = (
        db.query(DiscoveredListing).filter(DiscoveredListing.id == listing_id).one_or_none()
    )
    if listing is None:
        raise DiscoveredListingNotFoundError(listing_id)
    row = _dismissal(db, user_id, listing_id)
    if row is None:
        row = DiscoveryDismissedListing(user_id=user_id, listing_id=listing_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return DismissalItem(listing_id=row.listing_id, created_at=row.created_at)


def undismiss_recommendation(db: Session, user_id: str, listing_id: str) -> None:
    row = _dismissal(db, user_id, listing_id)
    if row is None:
        return
    db.delete(row)
    db.commit()


def dismissed_listing_ids(db: Session, user_id: str) -> set[str]:
    return {
        listing_id
        for (listing_id,) in db.query(DiscoveryDismissedListing.listing_id).filter(
            DiscoveryDismissedListing.user_id == user_id
        )
    }


def export_personalization(db: Session, user_id: str) -> PersonalizationExport:
    rows = (
        db.query(DiscoveryDismissedListing)
        .filter(DiscoveryDismissedListing.user_id == user_id)
        .order_by(DiscoveryDismissedListing.created_at.desc())
        .all()
    )
    return PersonalizationExport(
        dismissals=[
            DismissalItem(listing_id=row.listing_id, created_at=row.created_at) for row in rows
        ]
    )


def delete_personalization(db: Session, user_id: str) -> int:
    """Owner-scoped hard delete used by the account-deletion cascade."""
    return (
        db.query(DiscoveryDismissedListing)
        .filter(DiscoveryDismissedListing.user_id == user_id)
        .delete(synchronize_session=False)
    )
