"""Application details: contact details and standing answers (#374).

Revision ID: b7e2d9c4f1a6
Revises: b7e2d9f4a1c6
Create Date: 2026-09-28

One row per owner. Autopilot fills application forms from it instead of
guessing contact details from CV text.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e2d9c4f1a6"
down_revision: Union[str, None] = "b7e2d9f4a1c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STANDING_ANSWERS = (
    "work_authorization",
    "visa_sponsorship",
    "notice_period",
    "salary_expectation",
    "relocation",
)


def upgrade() -> None:
    op.create_table(
        "application_details",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("full_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("email", sa.String(320), nullable=False, server_default=""),
        sa.Column("phone", sa.String(50), nullable=False, server_default=""),
        sa.Column("linkedin", sa.String(500), nullable=False, server_default=""),
        sa.Column("website", sa.String(500), nullable=False, server_default=""),
        sa.Column("location", sa.String(200), nullable=False, server_default=""),
        *(
            sa.Column(name, sa.Text(), nullable=False, server_default="")
            for name in STANDING_ANSWERS
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("application_details")
