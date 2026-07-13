"""add packet stop answers

Revision ID: e4c1f2a8b9d3
Revises: d2b7f4a9c1e6
"""

import sqlalchemy as sa

from alembic import op

revision = "e4c1f2a8b9d3"
down_revision = "d2b7f4a9c1e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "packet_stop_answers",
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
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("packet_id", "field", name="uq_packet_stop_answer_field"),
    )
    op.create_index("ix_packet_stop_answers_user_id", "packet_stop_answers", ["user_id"])
    op.create_index("ix_packet_stop_answers_packet_id", "packet_stop_answers", ["packet_id"])


def downgrade():
    op.drop_table("packet_stop_answers")
