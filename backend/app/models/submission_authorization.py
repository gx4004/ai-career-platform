import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.discovery_source import DiscoverySource
    from app.models.user import User


class SubmissionAuthorizationGrant(Base):
    """Non-secret evidence of one explicit, source-provided authorization flow.

    The row deliberately has no credential, token, cookie, provider subject, or
    arbitrary metadata column. A future source adapter owns the provider exchange
    and may call the recording seam only after that flow and user consent complete.
    """

    __tablename__ = "submission_authorization_grants"
    __table_args__ = (
        CheckConstraint(
            "mechanism IN ('oauth2_authorization_code', 'oauth2_device_authorization')",
            name="ck_submission_authorization_mechanism",
        ),
        CheckConstraint(
            "scope = 'submit_applications'",
            name="ck_submission_authorization_scope",
        ),
        UniqueConstraint(
            "user_id",
            "discovery_source_id",
            name="uq_submission_authorization_owner_source",
        ),
    )

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    discovery_source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mechanism: Mapped[str] = mapped_column(String(40), nullable=False)
    scope: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="submit_applications",
        server_default="submit_applications",
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped["User"] = relationship(back_populates="submission_authorizations")
    discovery_source: Mapped["DiscoverySource"] = relationship(
        back_populates="user_submission_authorizations"
    )
