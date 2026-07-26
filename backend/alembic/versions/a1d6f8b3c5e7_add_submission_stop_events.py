"""add submission stop events

Revision ID: a1d6f8b3c5e7
Revises: f9c5e7d2a4b8
"""

import sqlalchemy as sa
from alembic import op

revision = "a1d6f8b3c5e7"
down_revision = "f9c5e7d2a4b8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "submission_stop_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("packet_approval_snapshot_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("authorization_grant_id", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("contract_version", sa.String(100), nullable=False),
        sa.Column("contract_sha256", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("source_code", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["packet_approval_snapshot_id"],
            ["packet_approval_snapshots.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"], ["discovery_sources.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "reason IN ('challenge', 'authentication_required', 'uncertainty', "
            "'compatibility_mismatch', 'source_validation_rejected')",
            name="ck_submission_stop_event_reason",
        ),
        sa.UniqueConstraint(
            "packet_approval_snapshot_id",
            "discovery_source_id",
            name="uq_submission_stop_event_snapshot_source",
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_submission_stop_event_idempotency_key"),
    )
    for column in ("user_id", "packet_approval_snapshot_id", "discovery_source_id"):
        op.create_index(f"ix_submission_stop_events_{column}", "submission_stop_events", [column])
    op.execute(
        """
        CREATE FUNCTION prevent_submission_stop_event_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Submission stop events are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER submission_stop_events_prevent_update
        BEFORE UPDATE ON submission_stop_events
        FOR EACH ROW EXECUTE FUNCTION prevent_submission_stop_event_update();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER submission_stop_events_prevent_update ON submission_stop_events")
    op.execute("DROP FUNCTION prevent_submission_stop_event_update()")
    op.drop_table("submission_stop_events")
