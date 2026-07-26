"""Shared owner-role identity and serialization boundary.

Packet approval and campaign submission tracking are two views of the same
application lifecycle. Both lock the owner row before checking or creating their
immutable records so PostgreSQL cannot interleave conflicting same-role writes.
"""

import hashlib
import json
import unicodedata

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.user import User
from app.models.workspace import Workspace


def _normalize(value: str | None) -> str:
    return " ".join(unicodedata.normalize("NFC", value or "").split()).casefold()


def normalized_role_key(
    company: str | None,
    role: str | None,
    *,
    fallback_campaign_id: str,
) -> str:
    """Hash an injective normalized tuple into a fixed-size duplicate key."""
    normalized = [_normalize(company), _normalize(role)]
    if not any(normalized):
        return f"campaign:{fallback_campaign_id}"
    encoded = json.dumps(
        normalized,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    return f"role:v1:{hashlib.sha256(encoded).hexdigest()}"


def application_role_key(campaign: Workspace) -> str:
    """Return the stable duplicate-prevention identity for one campaign role."""
    # A listing is the canonical application target. Editable workspace labels are
    # an identity source only for manually-created, listing-less campaigns; mixing
    # them would let a label edit split submission from packet approval.
    return normalized_role_key(
        campaign.listing.company if campaign.listing is not None else campaign.company,
        campaign.listing.title if campaign.listing is not None else campaign.role,
        fallback_campaign_id=campaign.id,
    )


def packet_application_role_key(packet: ApplicationPacket) -> str:
    """Identity of the packet's immutable target, never editable campaign labels."""
    if packet.listing is None:
        return f"campaign:{packet.campaign_id}"
    return normalized_role_key(
        packet.listing.company,
        packet.listing.title,
        fallback_campaign_id=packet.campaign_id,
    )


def lock_application_owner(db: Session, user_id: str) -> None:
    """Serialize approval/submission records for an owner in this transaction."""
    db.query(User.id).filter(User.id == user_id).with_for_update().one()
