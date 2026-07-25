"""Add dark R16 submission-source governance records (#189).

Revision ID: c6f1a3e8b2d4
Revises: b5e9f2d4a638
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c6f1a3e8b2d4"
down_revision: Union[str, None] = "b5e9f2d4a638"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "submission_source_governance",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column(
            "legal_terms_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("legal_terms_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("legal_terms_reviewed_by", sa.String(160), nullable=True),
        sa.Column(
            "contract_status",
            sa.String(20),
            nullable=False,
            server_default="missing",
        ),
        sa.Column("contract_version", sa.String(100), nullable=True),
        sa.Column("contract_fields", sa.JSON(), nullable=True),
        sa.Column("contract_formats", sa.JSON(), nullable=True),
        sa.Column("contract_error_semantics", sa.JSON(), nullable=True),
        sa.Column("contract_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contract_reviewed_by", sa.String(160), nullable=True),
        sa.Column("promoted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("promoted_by", sa.String(160), nullable=True),
        sa.Column("kill_switch", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "legal_terms_status IN ('pending', 'accepted', 'failed')",
            name="ck_submission_source_legal_terms_status",
        ),
        sa.CheckConstraint(
            "contract_status IN ('missing', 'verified', 'broken')",
            name="ck_submission_source_contract_status",
        ),
        sa.CheckConstraint(
            "(legal_terms_status = 'pending' AND legal_terms_reviewed_at IS NULL "
            "AND legal_terms_reviewed_by IS NULL) OR "
            "(legal_terms_status IN ('accepted', 'failed') "
            "AND legal_terms_reviewed_at IS NOT NULL "
            "AND legal_terms_reviewed_by IS NOT NULL)",
            name="ck_submission_source_legal_terms_review",
        ),
        sa.CheckConstraint(
            "(contract_status = 'missing' AND contract_version IS NULL "
            "AND contract_fields IS NULL AND contract_formats IS NULL "
            "AND contract_error_semantics IS NULL AND contract_reviewed_at IS NULL "
            "AND contract_reviewed_by IS NULL) OR "
            "(contract_status IN ('verified', 'broken') AND contract_version IS NOT NULL "
            "AND contract_fields IS NOT NULL AND contract_formats IS NOT NULL "
            "AND contract_error_semantics IS NOT NULL AND contract_reviewed_at IS NOT NULL "
            "AND contract_reviewed_by IS NOT NULL)",
            name="ck_submission_source_contract_record",
        ),
        sa.CheckConstraint(
            "(promoted = false AND promoted_at IS NULL AND promoted_by IS NULL) OR "
            "(promoted = true AND promoted_at IS NOT NULL AND promoted_by IS NOT NULL "
            "AND legal_terms_status = 'accepted' AND contract_status = 'verified')",
            name="ck_submission_source_promotion_record",
        ),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"],
            ["discovery_sources.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_submission_source_governance_discovery_source_id",
        "submission_source_governance",
        ["discovery_source_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_submission_source_governance_discovery_source_id",
        table_name="submission_source_governance",
    )
    op.drop_table("submission_source_governance")
