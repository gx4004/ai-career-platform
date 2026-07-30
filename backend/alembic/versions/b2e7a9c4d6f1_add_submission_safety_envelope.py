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
        "submission_incident_rehearsals",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("playbook_version", sa.String(100), nullable=False),
        sa.Column("evidence_reference", sa.String(200), nullable=False),
        sa.Column("roles_confirmed", sa.Boolean(), nullable=False),
        sa.Column("rollback_rehearsed", sa.Boolean(), nullable=False),
        sa.Column("communication_reviewed", sa.Boolean(), nullable=False),
        sa.Column("recorded_by", sa.String(160), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("roles_confirmed = true", name="ck_rehearsal_roles_confirmed"),
        sa.CheckConstraint("rollback_rehearsed = true", name="ck_rehearsal_rollback_rehearsed"),
        sa.CheckConstraint(
            "communication_reviewed = true", name="ck_rehearsal_communication_reviewed"
        ),
    )
    op.create_index(
        "ix_submission_incident_rehearsals_recorded_at",
        "submission_incident_rehearsals",
        ["recorded_at"],
    )
    op.create_table(
        "submission_safety_controls",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("global_kill_switch", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("incident_playbook_version", sa.String(100), nullable=True),
        sa.Column("incident_rehearsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("incident_rehearsed_by", sa.String(160), nullable=True),
        sa.Column("incident_rehearsal_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["incident_rehearsal_id"],
            ["submission_incident_rehearsals.id"],
            ondelete="SET NULL",
        ),
        sa.CheckConstraint("id = 'global'", name="ck_submission_safety_control_singleton"),
        sa.CheckConstraint(
            "(incident_playbook_version IS NULL AND incident_rehearsed_at IS NULL "
            "AND incident_rehearsed_by IS NULL AND incident_rehearsal_id IS NULL) OR "
            "(incident_playbook_version IS NOT NULL AND incident_rehearsed_at IS NOT NULL "
            "AND incident_rehearsed_by IS NOT NULL AND incident_rehearsal_id IS NOT NULL)",
            name="ck_submission_safety_rehearsal_complete",
        ),
    )
    op.execute(
        """
        INSERT INTO submission_safety_controls
            (id, global_kill_switch, created_at, updated_at)
        VALUES ('global', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
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
    op.create_table(
        "submission_dispatch_attempts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"], ["discovery_sources.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["idempotency_key"],
            ["submission_dispatch_claims.idempotency_key"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("user_id", "discovery_source_id", "idempotency_key", "created_at"):
        op.create_index(
            f"ix_submission_dispatch_attempts_{column}",
            "submission_dispatch_attempts",
            [column],
        )
    op.execute(
        """
        CREATE FUNCTION prevent_submission_incident_rehearsal_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Submission incident rehearsals are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER submission_incident_rehearsals_prevent_update
        BEFORE UPDATE ON submission_incident_rehearsals
        FOR EACH ROW EXECUTE FUNCTION prevent_submission_incident_rehearsal_update();
        """
    )
    op.execute(
        """
        CREATE FUNCTION prevent_submission_dispatch_attempt_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Submission dispatch attempts are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER submission_dispatch_attempts_prevent_update
        BEFORE UPDATE ON submission_dispatch_attempts
        FOR EACH ROW EXECUTE FUNCTION prevent_submission_dispatch_attempt_update();
        """
    )


def downgrade():
    op.execute(
        "DROP TRIGGER submission_dispatch_attempts_prevent_update ON submission_dispatch_attempts"
    )
    op.execute("DROP FUNCTION prevent_submission_dispatch_attempt_update()")
    op.execute(
        "DROP TRIGGER submission_incident_rehearsals_prevent_update "
        "ON submission_incident_rehearsals"
    )
    op.execute("DROP FUNCTION prevent_submission_incident_rehearsal_update()")
    op.drop_table("submission_dispatch_attempts")
    op.drop_table("submission_safety_policies")
    op.drop_table("submission_safety_controls")
    op.drop_table("submission_incident_rehearsals")
