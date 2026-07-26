"""add idempotent submission records

Revision ID: f9c5e7d2a4b8
Revises: e8b4d6c1f3a9
"""

import sqlalchemy as sa
from alembic import op

revision = "f9c5e7d2a4b8"
down_revision = "e8b4d6c1f3a9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "submission_dispatch_claims",
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("packet_approval_snapshot_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("authorization_grant_id", sa.String(), nullable=False),
        sa.Column("snapshot_content_sha256", sa.String(64), nullable=False),
        sa.Column("contract_version", sa.String(100), nullable=False),
        sa.Column("contract_sha256", sa.String(64), nullable=False),
        sa.Column("submitted_fields_json", sa.Text(), nullable=False),
        sa.Column("submitted_fields_sha256", sa.String(64), nullable=False),
        sa.Column("accepted_source_codes_json", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("idempotency_key"),
    )
    op.create_index(
        "ix_submission_dispatch_claims_user_id",
        "submission_dispatch_claims",
        ["user_id"],
    )
    op.execute(
        """
        CREATE FUNCTION prevent_submission_dispatch_claim_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Submission dispatch claims are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER submission_dispatch_claims_prevent_update
        BEFORE UPDATE ON submission_dispatch_claims
        FOR EACH ROW EXECUTE FUNCTION prevent_submission_dispatch_claim_update();
        """
    )
    op.create_table(
        "submission_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("packet_approval_snapshot_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("authorization_grant_id", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("snapshot_content_sha256", sa.String(64), nullable=False),
        sa.Column("contract_version", sa.String(100), nullable=False),
        sa.Column("contract_sha256", sa.String(64), nullable=False),
        sa.Column("submitted_fields_json", sa.Text(), nullable=False),
        sa.Column("submitted_fields_sha256", sa.String(64), nullable=False),
        sa.Column("source_confirmation_id", sa.String(200), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.UniqueConstraint(
            "packet_approval_snapshot_id",
            "discovery_source_id",
            name="uq_submission_record_snapshot_source",
        ),
        sa.UniqueConstraint(
            "idempotency_key", name="uq_submission_record_idempotency_key"
        ),
    )
    for column in ("user_id", "packet_approval_snapshot_id", "discovery_source_id"):
        op.create_index(f"ix_submission_records_{column}", "submission_records", [column])
    op.execute(
        """
        CREATE FUNCTION prevent_submission_record_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Submission records are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER submission_records_prevent_update
        BEFORE UPDATE ON submission_records
        FOR EACH ROW EXECUTE FUNCTION prevent_submission_record_update();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER submission_records_prevent_update ON submission_records")
    op.execute("DROP FUNCTION prevent_submission_record_update()")
    op.drop_table("submission_records")
    op.execute(
        "DROP TRIGGER submission_dispatch_claims_prevent_update "
        "ON submission_dispatch_claims"
    )
    op.execute("DROP FUNCTION prevent_submission_dispatch_claim_update()")
    op.drop_table("submission_dispatch_claims")
