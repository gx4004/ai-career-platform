"""add queue rules, caps, and cost ceilings

Revision ID: c9f3a1e5b7d2
Revises: b3e6c9d2f1a4
"""

import sqlalchemy as sa

from alembic import op

revision = "c9f3a1e5b7d2"
down_revision = "b3e6c9d2f1a4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "queue_rules",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rule_type", sa.String(40), nullable=False),
        sa.Column("keywords", sa.JSON(), nullable=True),
        sa.Column("min_score", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "rule_type", name="uq_queue_rule_owner_type"),
        sa.CheckConstraint(
            "rule_type IN "
            "('role', 'location', 'compensation', 'work_authorization', 'quality_threshold')",
            name="ck_queue_rule_type",
        ),
        sa.CheckConstraint(
            "min_score IS NULL OR (min_score >= 0 AND min_score <= 100)",
            name="ck_queue_rule_min_score_range",
        ),
    )
    op.create_index("ix_queue_rules_user_id", "queue_rules", ["user_id"])

    op.create_table(
        "queue_settings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("max_packets_per_run", sa.Integer(), nullable=False),
        sa.Column("cost_ceiling_usd", sa.Numeric(10, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_queue_settings_owner"),
        sa.CheckConstraint(
            "max_packets_per_run > 0 AND max_packets_per_run <= 1000",
            name="ck_queue_settings_volume_cap",
        ),
        sa.CheckConstraint(
            "cost_ceiling_usd > 0",
            name="ck_queue_settings_cost_ceiling",
        ),
    )
    op.create_index("ix_queue_settings_user_id", "queue_settings", ["user_id"])


def downgrade():
    op.drop_table("queue_settings")
    op.drop_table("queue_rules")
