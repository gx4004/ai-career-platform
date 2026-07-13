from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.application_packets import (
    ApplicationPacketItem,
    ApplicationPacketList,
    PacketPreparationResult,
)
from app.services.application_packets import (
    PacketNotFoundError,
    get_packet,
    list_packets,
    prepare_packets,
)

router = APIRouter()


@router.post("/prepare", response_model=PacketPreparationResult)
async def prepare(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Prepare a reference-based packet for every candidate passing the owner's rules.

    Server-authoritative: candidate filtering, the volume cap, and the cost ceiling
    are enforced during preparation (D-094). Preparation is preparation-only — no
    submission is performed (ADR 0009).
    """
    return await prepare_packets(db, current_user.id)


@router.get("", response_model=ApplicationPacketList)
def get_packets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner's prepared packets, each a set of references to existing entities."""
    return list_packets(db, current_user.id)


@router.get("/{packet_id}", response_model=ApplicationPacketItem)
def get_one_packet(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_packet(db, current_user.id, packet_id)
    except PacketNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
