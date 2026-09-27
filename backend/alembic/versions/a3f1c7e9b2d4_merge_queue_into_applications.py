"""Merge the approval queue and packets into Applications (#359).

Revision ID: a3f1c7e9b2d4
Revises: b6d1f3a8c5e9
Create Date: 2026-09-28

An Application is the ``workspaces`` row. It gains the prepared drafts, the
open questions and the owner's answers, ``applied_at``, a match score and a
notes column. Mark-as-applied is the only freeze point, into
``application_snapshots`` (the old campaign submission snapshots without the
role key). Queue rules and settings become one ``application_preferences`` row.

Local data is not carried over (owner decision: reset the local database; the
slice migrations are squashed later in #378). Packets, stop answers, approval
snapshots, the queue audit log, queue rules/settings, pause rows, notes and
contacts are dropped. The downgrade recreates those tables empty, in their last
shape, so the chain still round-trips.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f1c7e9b2d4"
down_revision: Union[str, None] = "b6d1f3a8c5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_STATUS_CHECK = (
    "status IS NULL OR status IN "
    "('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')"
)
OLD_STATUS_CHECK = (
    "status IS NULL OR status IN ('planning', 'preparing', 'applied', "
    "'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn')"
)


def upgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS packet_approval_snapshots_prevent_update "
        "ON packet_approval_snapshots"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_packet_approval_snapshot_update()")
    for table in (
        "packet_approval_snapshots",
        "packet_stop_answers",
        "queue_audit_events",
        "application_packets",
        "queue_rules",
        "queue_settings",
        "pipeline_halts",
        "campaign_notes",
        "campaign_contacts",
    ):
        op.drop_table(table)

    op.drop_index(
        "ix_campaign_submission_snapshots_role_key", table_name="campaign_submission_snapshots"
    )
    op.drop_column("campaign_submission_snapshots", "role_key")
    op.drop_index(
        "ix_campaign_submission_snapshots_workspace_id",
        table_name="campaign_submission_snapshots",
    )
    op.drop_constraint(
        "uq_campaign_submission_snapshot_workspace",
        "campaign_submission_snapshots",
        type_="unique",
    )
    op.rename_table("campaign_submission_snapshots", "application_snapshots")
    op.create_unique_constraint(
        "uq_application_snapshot_workspace", "application_snapshots", ["workspace_id"]
    )
    op.create_index(
        "ix_application_snapshots_workspace_id", "application_snapshots", ["workspace_id"]
    )

    op.create_table(
        "application_preferences",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("keywords", sa.JSON(), nullable=False),
        sa.Column("locations", sa.JSON(), nullable=False),
        sa.Column("remote", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_per_run", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "max_per_run >= 1 AND max_per_run <= 10",
            name="ck_application_preferences_max_per_run",
        ),
    )

    op.add_column("campaign_listings", sa.Column("apply_url", sa.String(2048), nullable=True))
    op.execute("UPDATE campaign_listings SET apply_url = source_url")

    op.drop_constraint("ck_workspaces_campaign_status", "workspaces", type_="check")
    op.execute("UPDATE workspaces SET status = 'saved' WHERE status IN ('planning', 'preparing')")
    op.execute("UPDATE workspaces SET status = 'offer' WHERE status = 'accepted'")
    op.create_check_constraint(
        "ck_workspaces_application_status", "workspaces", NEW_STATUS_CHECK
    )
    op.drop_column("workspaces", "reminders_last_surfaced_at")
    op.drop_column("workspaces", "reminders_enabled")
    op.add_column(
        "workspaces",
        sa.Column(
            "drafts_run_id",
            sa.String(),
            sa.ForeignKey(
                "tool_runs.id", name="fk_workspaces_drafts_run_id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column("open_questions", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "workspaces", sa.Column("answers", sa.JSON(), nullable=False, server_default="{}")
    )
    op.add_column("workspaces", sa.Column("applied_at", sa.DateTime(timezone=True)))
    op.add_column("workspaces", sa.Column("match_score", sa.Integer()))
    op.add_column("workspaces", sa.Column("notes", sa.Text()))
    op.execute(
        "UPDATE workspaces SET applied_at = s.created_at FROM application_snapshots s "
        "WHERE s.workspace_id = workspaces.id"
    )


def downgrade() -> None:
    op.drop_column("workspaces", "notes")
    op.drop_column("workspaces", "match_score")
    op.drop_column("workspaces", "applied_at")
    op.drop_column("workspaces", "answers")
    op.drop_column("workspaces", "open_questions")
    op.drop_constraint("fk_workspaces_drafts_run_id", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "drafts_run_id")
    op.add_column(
        "workspaces",
        sa.Column("reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "workspaces",
        sa.Column("reminders_last_surfaced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_constraint("ck_workspaces_application_status", "workspaces", type_="check")
    op.execute("UPDATE workspaces SET status = 'planning' WHERE status = 'saved'")
    op.create_check_constraint("ck_workspaces_campaign_status", "workspaces", OLD_STATUS_CHECK)

    op.drop_column("campaign_listings", "apply_url")
    op.drop_table("application_preferences")

    op.drop_index("ix_application_snapshots_workspace_id", table_name="application_snapshots")
    op.drop_constraint(
        "uq_application_snapshot_workspace", "application_snapshots", type_="unique"
    )
    op.rename_table("application_snapshots", "campaign_submission_snapshots")
    op.create_unique_constraint(
        "uq_campaign_submission_snapshot_workspace",
        "campaign_submission_snapshots",
        ["workspace_id"],
    )
    op.create_index(
        "ix_campaign_submission_snapshots_workspace_id",
        "campaign_submission_snapshots",
        ["workspace_id"],
    )
    # No frozen role identity survives the upgrade: an honest per-campaign key.
    op.add_column(
        "campaign_submission_snapshots", sa.Column("role_key", sa.String(512), nullable=True)
    )
    op.execute("UPDATE campaign_submission_snapshots SET role_key = 'campaign:' || workspace_id")
    op.alter_column(
        "campaign_submission_snapshots",
        "role_key",
        existing_type=sa.String(512),
        nullable=False,
    )
    op.create_index(
        "ix_campaign_submission_snapshots_role_key",
        "campaign_submission_snapshots",
        ["role_key"],
    )
    _recreate_dropped_tables()


def _owner_column() -> sa.Column:
    return sa.Column(
        "user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def _workspace_child(name: str, *columns: sa.Column) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        *columns,
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(f"ix_{name}_workspace_id", name, ["workspace_id"])


def _recreate_dropped_tables() -> None:
    """The dropped tables in their last shape, empty."""
    _workspace_child("campaign_notes", sa.Column("text", sa.Text(), nullable=False))
    _workspace_child(
        "campaign_contacts",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(200)),
        sa.Column("channel", sa.String(200)),
    )
    op.create_table(
        "pipeline_halts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("scope", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("halted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("scope", name="uq_pipeline_halt_scope"),
    )
    op.create_index("ix_pipeline_halts_scope", "pipeline_halts", ["scope"])
    op.create_table(
        "queue_settings",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
        sa.Column("max_packets_per_run", sa.Integer(), nullable=False),
        sa.Column("cost_ceiling_usd", sa.Numeric(10, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_queue_settings_owner"),
        sa.CheckConstraint(
            "max_packets_per_run > 0 AND max_packets_per_run <= 1000",
            name="ck_queue_settings_volume_cap",
        ),
        sa.CheckConstraint("cost_ceiling_usd > 0", name="ck_queue_settings_cost_ceiling"),
    )
    op.create_index("ix_queue_settings_user_id", "queue_settings", ["user_id"])
    op.create_table(
        "queue_rules",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
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
        "application_packets",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
        sa.Column(
            "campaign_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            sa.String(),
            sa.ForeignKey("discovered_listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cv_variant_id",
            sa.String(),
            sa.ForeignKey("cv_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "drafts_run_id",
            sa.String(),
            sa.ForeignKey("tool_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("match_rationale", sa.JSON(), nullable=False),
        sa.Column("unresolved_questions", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("gate_state", sa.String(16), nullable=False, server_default="pending"),
        sa.Column(
            "review_run_id",
            sa.String(),
            sa.ForeignKey("tool_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "listing_attribution_id",
            sa.String(),
            sa.ForeignKey(
                "discovered_listing_attributions.id",
                name="fk_application_packets_listing_attribution_id",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.UniqueConstraint("user_id", "listing_id", name="uq_packet_owner_listing"),
        sa.CheckConstraint("status IN ('prepared', 'blocked')", name="ck_application_packet_status"),
        sa.CheckConstraint(
            "decision IN ('pending', 'accepted', 'skipped', 'rejected')",
            name="ck_application_packet_decision",
        ),
        sa.CheckConstraint(
            "gate_state IN ('pending', 'passed', 'blocked')",
            name="ck_application_packet_gate_state",
        ),
    )
    for column in ("user_id", "campaign_id", "listing_id", "listing_attribution_id"):
        op.create_index(f"ix_application_packets_{column}", "application_packets", [column])
    op.create_table(
        "queue_audit_events",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("packet_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_queue_audit_events_user_id", "queue_audit_events", ["user_id"])
    op.create_table(
        "packet_stop_answers",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
        sa.Column(
            "packet_id",
            sa.String(),
            sa.ForeignKey("application_packets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("packet_id", "field", name="uq_packet_stop_answer_field"),
    )
    op.create_index("ix_packet_stop_answers_user_id", "packet_stop_answers", ["user_id"])
    op.create_index("ix_packet_stop_answers_packet_id", "packet_stop_answers", ["packet_id"])
    op.create_table(
        "packet_approval_snapshots",
        sa.Column("id", sa.String(), primary_key=True),
        _owner_column(),
        sa.Column(
            "packet_id",
            sa.String(),
            sa.ForeignKey("application_packets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("listing_id", sa.String(), nullable=True),
        sa.Column("role_key", sa.String(512), nullable=False),
        sa.Column("destination_url", sa.String(2048), nullable=True),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("packet_id", name="uq_packet_approval_snapshot_packet"),
        sa.UniqueConstraint("user_id", "role_key", name="uq_packet_approval_snapshot_owner_role"),
    )
    for column in ("user_id", "packet_id", "campaign_id", "role_key"):
        op.create_index(
            f"ix_packet_approval_snapshots_{column}", "packet_approval_snapshots", [column]
        )
    op.execute(
        """
        CREATE FUNCTION prevent_packet_approval_snapshot_update()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Packet approval snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER packet_approval_snapshots_prevent_update
        BEFORE UPDATE ON packet_approval_snapshots
        FOR EACH ROW
        EXECUTE FUNCTION prevent_packet_approval_snapshot_update();
        """
    )
