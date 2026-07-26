"""add submission safety envelope

Revision ID: b2e7a9c4d6f1
Revises: a1d6f8b3c5e7
"""

import sqlalchemy as sa

from alembic import op

revision = "b2e7a9c4d6f1"
down_revision = "a1d6f8b3c5e7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "submission_safety_controls",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("global_kill_switch", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("incident_playbook_version", sa.String(100), nullable=True),
        sa.Column("incident_rehearsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("incident_rehearsed_by", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 'global'", name="ck_submission_safety_control_singleton"),
        sa.CheckConstraint(
            "(incident_playbook_version IS NULL AND incident_rehearsed_at IS NULL "
            "AND incident_rehearsed_by IS NULL) OR "
            "(incident_playbook_version IS NOT NULL AND incident_rehearsed_at IS NOT NULL "
            "AND incident_rehearsed_by IS NOT NULL)",
            name="ck_submission_safety_rehearsal_complete",
        ),
    )
    op.create_table(
        "submission_safety_policies",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("user_rate_limit_per_minute", sa.Integer(), nullable=False),
        sa.Column("user_daily_volume_limit", sa.Integer(), nullable=False),
        sa.Column("source_rate_limit_per_minute", sa.Integer(), nullable=False),
        sa.Column("source_daily_volume_limit", sa.Integer(), nullable=False),
        sa.Column("anomaly_user_attempts_per_hour", sa.Integer(), nullable=False),
        sa.Column("configured_by", sa.String(160), nullable=False),
        sa.Column("configured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"], ["discovery_sources.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("discovery_source_id"),
        sa.CheckConstraint(
            "user_rate_limit_per_minute BETWEEN 1 AND 60",
            name="ck_submission_safety_user_rate",
        ),
        sa.CheckConstraint(
            "user_daily_volume_limit BETWEEN 1 AND 1000",
            name="ck_submission_safety_user_volume",
        ),
        sa.CheckConstraint(
            "source_rate_limit_per_minute BETWEEN 1 AND 1000",
            name="ck_submission_safety_source_rate",
        ),
        sa.CheckConstraint(
            "source_daily_volume_limit BETWEEN 1 AND 100000",
            name="ck_submission_safety_source_volume",
        ),
        sa.CheckConstraint(
            "anomaly_user_attempts_per_hour BETWEEN 1 AND 1000",
            name="ck_submission_safety_anomaly_threshold",
        ),
        sa.CheckConstraint(
            "anomaly_user_attempts_per_hour <= user_daily_volume_limit",
            name="ck_submission_safety_anomaly_before_daily_limit",
        ),
    )
    op.create_index(
        "ix_submission_safety_policies_discovery_source_id",
        "submission_safety_policies",
        ["discovery_source_id"],
        unique=True,
    )


def downgrade():
    op.drop_table("submission_safety_policies")
    op.drop_table("submission_safety_controls")
