"""add campaign material references

Revision ID: a4c8e2f6b1d3
Revises: e3a7c9d1f5b2
"""

import sqlalchemy as sa

from alembic import op

revision = "a4c8e2f6b1d3"
down_revision = "e3a7c9d1f5b2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workspaces", sa.Column("selected_cv_variant_id", sa.String(), nullable=True))
    op.add_column(
        "workspaces", sa.Column("selected_cover_letter_run_id", sa.String(), nullable=True)
    )
    op.add_column("workspaces", sa.Column("selected_interview_run_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_workspaces_selected_cv_variant",
        "workspaces",
        "cv_variants",
        ["selected_cv_variant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workspaces_selected_cover_letter",
        "workspaces",
        "tool_runs",
        ["selected_cover_letter_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workspaces_selected_interview",
        "workspaces",
        "tool_runs",
        ["selected_interview_run_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_workspaces_selected_interview", "workspaces", type_="foreignkey")
    op.drop_constraint("fk_workspaces_selected_cover_letter", "workspaces", type_="foreignkey")
    op.drop_constraint("fk_workspaces_selected_cv_variant", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "selected_interview_run_id")
    op.drop_column("workspaces", "selected_cover_letter_run_id")
    op.drop_column("workspaces", "selected_cv_variant_id")
