"""The owner's application details: typed once, read by every form fill (#374)."""

from sqlalchemy.orm import Session

from app.models.application_details import ApplicationDetails
from app.models.user import User
from app.schemas.applications import ApplicationDetailsBody, ApplicationDetailsResponse


def _row(db: Session, user_id: str) -> ApplicationDetails | None:
    return (
        db.query(ApplicationDetails).filter(ApplicationDetails.user_id == user_id).one_or_none()
    )


def get_details(db: Session, user: User) -> ApplicationDetailsResponse:
    """The saved details, or the account's name and email until the owner saves."""
    row = _row(db, user.id)
    if row is None:
        return ApplicationDetailsResponse(
            full_name=user.full_name or "", email=user.email or "", is_default=True
        )
    return ApplicationDetailsResponse.model_validate(row)


def save_details(
    db: Session, user_id: str, body: ApplicationDetailsBody
) -> ApplicationDetailsResponse:
    row = _row(db, user_id)
    if row is None:
        row = ApplicationDetails(user_id=user_id)
        db.add(row)
    for name, value in body.model_dump().items():
        setattr(row, name, value)
    db.commit()
    db.refresh(row)
    return ApplicationDetailsResponse.model_validate(row)


def export_details(db: Session, user_id: str) -> ApplicationDetailsResponse | None:
    row = _row(db, user_id)
    return ApplicationDetailsResponse.model_validate(row) if row else None


def delete_details(db: Session, user_id: str) -> None:
    db.query(ApplicationDetails).filter(ApplicationDetails.user_id == user_id).delete(
        synchronize_session=False
    )


def standing_answers(db: Session, user_id: str) -> dict[str, str]:
    """The owner's non-empty saved answers, by field name. Nothing before they save."""
    row = _row(db, user_id)
    if row is None:
        return {}
    return {
        name: value.strip()
        for name in (
            "work_authorization",
            "visa_sponsorship",
            "notice_period",
            "salary_expectation",
            "relocation",
        )
        if isinstance(value := getattr(row, name), str) and value.strip()
    }
