"""add packet review decision

Revision ID: b8c4e2f19d63
Revises: a7e3c9d1f45b
"""

import sqlalchemy as sa

from alembic import op

revision = "b8c4e2f19d63"
down_revision = "a7e3c9d1f45b"
branch_labels = None
depends_on = None


def upgrade():
    # The owner's review decision on the packet (R15 #183). Existing rows backfill to
    # ``pending`` via the server default; a bounded CHECK keeps the column in sync with
    # ``PACKET_DECISIONS`` on the model. Accept is guarded by the approval predicate
    # (D-095) in the service layer, not by this column alone.
    op.add_column(
        "application_packets",
        sa.Column(
            "decision",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
    )
    op.create_check_constraint(
        "ck_application_packet_decision",
        "application_packets",
        "decision IN ('pending', 'accepted', 'skipped', 'rejected')",
    )


def downgrade():
    op.drop_constraint(
        "ck_application_packet_decision", "application_packets", type_="check"
    )
    op.drop_column("application_packets", "decision")
