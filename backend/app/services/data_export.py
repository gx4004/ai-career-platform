from sqlalchemy.orm import Session

from app.schemas.data_export import CareerDataExport
from app.services.cv_documents import export_documents
from app.services.evidence_profile import export_evidence_profile


def export_career_data(db: Session, user_id: str) -> CareerDataExport:
    profile = export_evidence_profile(db, user_id)
    return CareerDataExport(
        exported_at=profile.exported_at,
        item_count=profile.item_count,
        items=profile.items,
        cv_documents=export_documents(db, user_id),
    )
