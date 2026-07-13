"""add cv tailoring quota

Revision ID: a9c7e5d3b1f0
Revises: b4f7c2d9e1a6
"""

from alembic import op
import sqlalchemy as sa

revision = "a9c7e5d3b1f0"
down_revision = "b4f7c2d9e1a6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cv_documents",
        sa.Column("tailoring_model_runs", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cv_variants", sa.Column("tailoring_request_id", sa.String(length=36), nullable=True)
    )
    op.create_unique_constraint(
        "uq_cv_variants_document_tailoring_request",
        "cv_variants",
        ["document_id", "tailoring_request_id"],
    )


def downgrade():
    op.drop_constraint("uq_cv_variants_document_tailoring_request", "cv_variants", type_="unique")
    op.drop_column("cv_variants", "tailoring_request_id")
    op.drop_column("cv_documents", "tailoring_model_runs")
