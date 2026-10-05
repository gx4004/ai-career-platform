from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.discovery_personalization import DiscoveryDeepMatchLink, DiscoveryDismissedListing
from app.schemas.discovery_personalization import DismissalItem, PersonalizationExport
from app.services.discovery_recommendations import is_live_listing


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
    # Same refusal as every other read: a listing the owner could never see is
    # not confirmed to exist. A listing they already hid is still live, so
    # hiding twice stays a no-op.
    if not is_live_listing(db, listing_id):
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
    db.query(DiscoveryDeepMatchLink).filter(DiscoveryDeepMatchLink.user_id == user_id).delete(
        synchronize_session=False
    )
    return (
        db.query(DiscoveryDismissedListing)
        .filter(DiscoveryDismissedListing.user_id == user_id)
        .delete(synchronize_session=False)
    )
