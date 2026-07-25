"""Shared owner-role identity and serialization boundary.

Packet approval and campaign submission tracking are two views of the same
application lifecycle. Both lock the owner row before checking or creating their
immutable records so PostgreSQL cannot interleave conflicting same-role writes.
"""

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.user import User
from app.models.workspace import Workspace


def _normalize(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def application_role_key(campaign: Workspace) -> str:
    """Return the stable duplicate-prevention identity for one campaign role."""
    # A listing is the canonical application target. Editable workspace labels are
    # an identity source only for manually-created, listing-less campaigns; mixing
    # them would let a label edit split submission from packet approval.
    company = _normalize(
        campaign.listing.company if campaign.listing is not None else campaign.company
    )
    role = _normalize(
        campaign.listing.title if campaign.listing is not None else campaign.role
    )
    if not company and not role:
        return f"campaign:{campaign.id}"
    return f"{company}|{role}"


def packet_application_role_key(packet: ApplicationPacket) -> str:
    """Identity of the packet's immutable target, never editable campaign labels."""
    if packet.listing is None:
        return f"campaign:{packet.campaign_id}"
    company = _normalize(packet.listing.company)
    role = _normalize(packet.listing.title)
    if not company and not role:
        return f"campaign:{packet.campaign_id}"
    return f"{company}|{role}"


def lock_application_owner(db: Session, user_id: str) -> None:
    """Serialize approval/submission records for an owner in this transaction."""
    db.query(User.id).filter(User.id == user_id).with_for_update().one()
