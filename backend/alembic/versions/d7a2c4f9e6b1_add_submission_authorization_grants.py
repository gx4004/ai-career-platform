"""Add dark per-source submission authorization grants (#190).

Revision ID: d7a2c4f9e6b1
Revises: c6f1a3e8b2d4
Create Date: 2026-07-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7a2c4f9e6b1"
down_revision: Union[str, None] = "c6f1a3e8b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "submission_authorization_grants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("mechanism", sa.String(40), nullable=False),
        sa.Column(
            "scope",
            sa.String(40),
            nullable=False,
            server_default="submit_applications",
        ),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "mechanism IN ('oauth2_authorization_code', 'oauth2_device_authorization')",
            name="ck_submission_authorization_mechanism",
        ),
        sa.CheckConstraint(
            "scope = 'submit_applications'",
            name="ck_submission_authorization_scope",
        ),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"],
            ["discovery_sources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "discovery_source_id",
            name="uq_submission_authorization_owner_source",
        ),
    )
    op.create_index(
        "ix_submission_authorization_grants_discovery_source_id",
        "submission_authorization_grants",
        ["discovery_source_id"],
        unique=False,
    )
    op.create_index(
        "ix_submission_authorization_grants_user_id",
        "submission_authorization_grants",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_submission_authorization_grants_user_id",
        table_name="submission_authorization_grants",
    )
    op.drop_index(
        "ix_submission_authorization_grants_discovery_source_id",
        table_name="submission_authorization_grants",
    )
    op.drop_table("submission_authorization_grants")
