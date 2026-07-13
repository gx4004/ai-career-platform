from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.history import CampaignReminderItem, CampaignReminderResponse

SURFACE_WINDOW = timedelta(days=7)
SURFACE_COOLDOWN = timedelta(hours=1)


def set_reminder_consent(
    db: Session, campaign: Workspace, enabled: bool
) -> CampaignReminderResponse:
    campaign.reminders_enabled = enabled
    campaign.reminders_last_surfaced_at = None
    db.commit()
    return CampaignReminderResponse(enabled=enabled)


def claim_due_reminders(
    db: Session, campaign_id: str, user_id: str, now: datetime | None = None
) -> CampaignReminderResponse:
    """Atomically claim due reminders for this surface window.

    The row lock makes the intentional GET-side suppression update safe when
    multiple tabs request the campaign simultaneously.
    """
    campaign = (
        db.query(Workspace)
        .filter(Workspace.id == campaign_id, Workspace.user_id == user_id)
        .with_for_update()
        .one()
    )
    now = now or datetime.now(UTC)
    if not campaign.reminders_enabled:
        return CampaignReminderResponse(enabled=False)
    last = campaign.reminders_last_surfaced_at
    if last is not None:
        last = last.replace(tzinfo=UTC) if last.tzinfo is None else last.astimezone(UTC)
        if now < last + SURFACE_COOLDOWN:
            return CampaignReminderResponse(enabled=True, next_surface_at=last + SURFACE_COOLDOWN)
    cutoff = now + SURFACE_WINDOW
    items: list[CampaignReminderItem] = []
    deadline = _utc(campaign.deadline)
    if deadline is not None and now <= deadline <= cutoff:
        items.append(
            CampaignReminderItem(
                kind="campaign_deadline", label="Application deadline", deadline=deadline
            )
        )
    for task in campaign.campaign_tasks:
        task_deadline = _utc(task.deadline)
        if not task.completed and task_deadline is not None and now <= task_deadline <= cutoff:
            items.append(
                CampaignReminderItem(
                    kind="task_deadline", task_id=task.id, label=task.title, deadline=task_deadline
                )
            )
    items.sort(key=lambda item: (item.deadline, item.task_id or ""))
    if items:
        campaign.reminders_last_surfaced_at = now
        db.commit()
    return CampaignReminderResponse(
        enabled=True, items=items, next_surface_at=now + SURFACE_COOLDOWN if items else None
    )


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
