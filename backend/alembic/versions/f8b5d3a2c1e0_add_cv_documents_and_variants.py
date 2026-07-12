"""Add owner-scoped CV documents and immutable variant snapshots (#153).

Revision ID: f8b5d3a2c1e0
Revises: e7a4c2f1b9d0
Create Date: 2026-07-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f8b5d3a2c1e0"
down_revision: Union[str, None] = "e7a4c2f1b9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cv_documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cv_documents_user_id", "cv_documents", ["user_id"])
    op.create_table(
        "cv_variants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("target_role", sa.String(length=200), nullable=True),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["cv_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "name", name="uq_cv_variants_document_name"),
    )
    op.create_index("ix_cv_variants_document_id", "cv_variants", ["document_id"])
    # Variant rows are append-only snapshots. Deletion remains available for the
    # parent-document/account erasure cascade, but no code path (including a future
    # accidental ORM write) may rewrite snapshot content or metadata.
    op.execute(
        """
        CREATE FUNCTION prevent_cv_variant_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'CV variant snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER cv_variants_prevent_update
        BEFORE UPDATE ON cv_variants
        FOR EACH ROW EXECUTE FUNCTION prevent_cv_variant_update();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER cv_variants_prevent_update ON cv_variants")
    op.execute("DROP FUNCTION prevent_cv_variant_update()")
    op.drop_index("ix_cv_variants_document_id", table_name="cv_variants")
    op.drop_table("cv_variants")
    op.drop_index("ix_cv_documents_user_id", table_name="cv_documents")
    op.drop_table("cv_documents")
