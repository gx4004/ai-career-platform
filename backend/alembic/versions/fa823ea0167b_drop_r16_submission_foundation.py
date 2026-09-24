"""Drop the dark R16 submission foundation tables (Refs #319).

R16 never shipped an outward submission path and never will — a future
Autopilot will be a local, browser-assisted filler that stops before submit
and needs none of this. This drops the nine dark submission-foundation tables
(and their immutability triggers/functions) added by revisions
b2e7a9c4d6f1, a1d6f8b3c5e7, f9c5e7d2a4b8, d7a2c4f9e6b1, and c6f1a3e8b2d4.
Those five migrations are left in place — this is a forward drop, not a
history rewrite. ``packet_approval_snapshots`` (added between two of them) is
untouched; the Approval Queue still needs it.

Revision ID: fa823ea0167b
Revises: a1c3e5f7b9d2
"""

import sqlalchemy as sa
from alembic import op

revision = "fa823ea0167b"
down_revision = "a1c3e5f7b9d2"
branch_labels = None
depends_on = None


def upgrade():
    # Drop child-before-parent so no live FK blocks a DROP TABLE.
    op.execute(
        "DROP TRIGGER IF EXISTS submission_dispatch_attempts_prevent_update "
        "ON submission_dispatch_attempts"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_submission_dispatch_attempt_update()")
    op.drop_table("submission_dispatch_attempts")

    op.execute(
        "DROP TRIGGER IF EXISTS submission_dispatch_claims_prevent_update "
        "ON submission_dispatch_claims"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_submission_dispatch_claim_update()")
    op.drop_table("submission_dispatch_claims")

    op.execute(
        "DROP TRIGGER IF EXISTS submission_records_prevent_update ON submission_records"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_submission_record_update()")
    op.drop_table("submission_records")

    op.execute(
        "DROP TRIGGER IF EXISTS submission_stop_events_prevent_update "
        "ON submission_stop_events"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_submission_stop_event_update()")
    op.drop_table("submission_stop_events")

    op.drop_table("submission_authorization_grants")

    op.drop_table("submission_source_governance")

    op.drop_table("submission_safety_controls")
    op.drop_table("submission_safety_policies")

    op.execute(
        "DROP TRIGGER IF EXISTS submission_incident_rehearsals_prevent_update "
        "ON submission_incident_rehearsals"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_submission_incident_rehearsal_update()")
    op.drop_table("submission_incident_rehearsals")


def downgrade():
    """Recreate the R16 submission-foundation structure (empty, no data).

    Mirrors the original migrations' ``upgrade()`` bodies so a downgrade lands
    on the same shape the app previously expected, rather than raising. There
    is no data to restore — the tables were dropped, not archived.
    """
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
        "submission_source_governance",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column(
            "legal_terms_status", sa.String(20), nullable=False, server_default="pending"
        ),
        sa.Column("legal_terms_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("legal_terms_reviewed_by", sa.String(160), nullable=True),
        sa.Column("contract_status", sa.String(20), nullable=False, server_default="missing"),
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
            ["discovery_source_id"], ["discovery_sources.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_submission_source_governance_discovery_source_id",
        "submission_source_governance",
        ["discovery_source_id"],
        unique=True,
    )

    op.create_table(
        "submission_authorization_grants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("discovery_source_id", sa.String(), nullable=False),
        sa.Column("mechanism", sa.String(40), nullable=False),
        sa.Column(
            "scope", sa.String(40), nullable=False, server_default="submit_applications"
        ),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "mechanism IN ('oauth2_authorization_code', 'oauth2_device_authorization')",
            name="ck_submission_authorization_mechanism",
        ),
        sa.CheckConstraint(
            "scope = 'submit_applications'", name="ck_submission_authorization_scope"
        ),
        sa.ForeignKeyConstraint(
            ["discovery_source_id"], ["discovery_sources.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "discovery_source_id", name="uq_submission_authorization_owner_source"
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
        sa.UniqueConstraint("idempotency_key", name="uq_submission_record_idempotency_key"),
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
