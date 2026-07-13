from sqlalchemy.orm import Session

from app.models.campaign_event import CampaignEvent
from app.models.campaign_tracking import CampaignContact, CampaignNote, CampaignTask
from app.models.workspace import Workspace
from app.schemas.history import CampaignContactCreate, CampaignNoteCreate, CampaignTaskCreate


def record_event(
    db: Session, campaign_id: str, event_type: str, details: dict, *, provenance: str = "user"
) -> None:
    stored_details = details if provenance == "user" else {**details, "provenance": provenance}
    db.add(
        CampaignEvent(
            workspace_id=campaign_id,
            event_type=event_type,
            details=stored_details,
        )
    )


def add_task(db: Session, campaign: Workspace, body: CampaignTaskCreate):
    task = CampaignTask(workspace_id=campaign.id, title=body.title.strip(), deadline=body.deadline)
    db.add(task)
    db.flush()
    record_event(
        db,
        campaign.id,
        "task_created",
        {"task_id": task.id, "has_deadline": task.deadline is not None},
    )
    db.commit()
    db.refresh(task)
    return task


def add_note(db: Session, campaign: Workspace, body: CampaignNoteCreate):
    note = CampaignNote(workspace_id=campaign.id, text=body.text.strip())
    db.add(note)
    db.flush()
    record_event(db, campaign.id, "note_added", {"note_id": note.id})
    db.commit()
    db.refresh(note)
    return note


def add_contact(db: Session, campaign: Workspace, body: CampaignContactCreate):
    contact = CampaignContact(
        workspace_id=campaign.id,
        name=body.name.strip(),
        role=body.role.strip() if body.role else None,
        channel=body.channel.strip() if body.channel else None,
    )
    db.add(contact)
    db.flush()
    record_event(db, campaign.id, "contact_added", {"contact_id": contact.id})
    db.commit()
    db.refresh(contact)
    return contact
