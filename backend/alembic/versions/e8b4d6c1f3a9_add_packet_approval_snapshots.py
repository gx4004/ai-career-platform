"""add packet approval snapshots

Revision ID: e8b4d6c1f3a9
Revises: d7a2c4f9e6b1
"""

import json

import sqlalchemy as sa

from alembic import op

revision = "e8b4d6c1f3a9"
down_revision = "d7a2c4f9e6b1"
branch_labels = None
depends_on = None


def _normalize_role_component(value: str | None) -> str:
    """Exact local copy of the runtime split/casefold identity contract."""
    return " ".join((value or "").split()).casefold()


def _backfill_submission_role_keys() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, workspace_id, content_json "
            "FROM campaign_submission_snapshots"
        )
    ).mappings()
    for row in rows:
        try:
            content = json.loads(row["content_json"])
        except (json.JSONDecodeError, TypeError):
            content = {}
        content = content if isinstance(content, dict) else {}
        listing = content.get("listing")
        listing = listing if isinstance(listing, dict) else {}
        company = _normalize_role_component(
            listing.get("company") if isinstance(listing.get("company"), str) else None
        )
        role = _normalize_role_component(
            listing.get("title") if isinstance(listing.get("title"), str) else None
        )
        role_key = (
            f"{company}|{role}"
            if company or role
            else f"campaign:{row['workspace_id']}"
        )
        bind.execute(
            sa.text(
                "UPDATE campaign_submission_snapshots "
                "SET role_key = :role_key WHERE id = :snapshot_id"
            ),
            {"role_key": role_key, "snapshot_id": row["id"]},
        )


def upgrade():
    # Pre-#185 ``accepted`` was only a mutable queue decision; no exact by-value
    # record exists from which an approval snapshot can be truthfully reconstructed.
    # Fail closed and require explicit re-approval under the new atomic boundary.
    op.execute(
        "UPDATE application_packets SET decision = 'pending' "
        "WHERE decision = 'accepted'"
    )
    op.add_column(
        "campaign_submission_snapshots",
        sa.Column("role_key", sa.String(512), nullable=True),
    )
    # Existing submission rows already contain an immutable listing copy. Derive
    # their identity from those frozen bytes, never from the later-editable
    # workspace. A listing-less legacy snapshot cannot prove a historical role, so
    # it receives an honest campaign-specific fallback rather than a guessed key.
    _backfill_submission_role_keys()
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
    op.create_table(
        "packet_approval_snapshots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
        sa.UniqueConstraint(
            "packet_id",
            name="uq_packet_approval_snapshot_packet",
        ),
        sa.UniqueConstraint(
            "user_id",
            "role_key",
            name="uq_packet_approval_snapshot_owner_role",
        ),
    )
    op.create_index(
        "ix_packet_approval_snapshots_user_id",
        "packet_approval_snapshots",
        ["user_id"],
    )
    op.create_index(
        "ix_packet_approval_snapshots_packet_id",
        "packet_approval_snapshots",
        ["packet_id"],
    )
    op.create_index(
        "ix_packet_approval_snapshots_campaign_id",
        "packet_approval_snapshots",
        ["campaign_id"],
    )
    op.create_index(
        "ix_packet_approval_snapshots_role_key",
        "packet_approval_snapshots",
        ["role_key"],
    )
    # Approval rows are append-only. Account/campaign erasure may DELETE them,
    # but no ORM bug or future code path may rewrite what the owner approved.
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


def downgrade():
    # Dropping the immutable record must not strand a packet in an apparently
    # approved state. A later re-upgrade will require a fresh, truthful approval.
    op.execute(
        "UPDATE application_packets SET decision = 'pending' "
        "WHERE id IN (SELECT packet_id FROM packet_approval_snapshots)"
    )
    op.execute(
        "DROP TRIGGER packet_approval_snapshots_prevent_update "
        "ON packet_approval_snapshots"
    )
    op.execute("DROP FUNCTION prevent_packet_approval_snapshot_update()")
    op.drop_table("packet_approval_snapshots")
    op.drop_index(
        "ix_campaign_submission_snapshots_role_key",
        table_name="campaign_submission_snapshots",
    )
    op.drop_column("campaign_submission_snapshots", "role_key")
