"""Add R11 profile-adoption dimensions to analytics_events (#150)

Revision ID: e7a4c2f1b9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-11

R11 #150 extends the same R6 first-party analytics path (D-067) with the
Evidence Profile's adoption/trust signals. It reuses the existing
`analytics_events` store rather than adding any analytics vendor, adding three
nullable, closed-set, low-cardinality columns:

- `evidence_kind` — the typed item kind (experience, achievement, skill, …).
  Indexed because the profile-adoption view groups created items by it.
- `evidence_provenance` — the provenance class (imported / inferred /
  user-entered).
- `confirmation_transition` — the resulting confirmation state of a
  create/edit/confirm/reject transition (null on deletion). Indexed because the
  view groups the trust transitions by it.

All three are null for every non-profile event and are constrained to Literal
values by the `ActivationEventCreate` allowlist (`extra="forbid"`), so no
evidence text, employer/institution name, or stable content identifier can ever
land here. Additive and reversible: the downgrade drops the indexes and all
three columns (no data to preserve, since non-profile rows never populated them).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a4c2f1b9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analytics_events",
        sa.Column("evidence_kind", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("evidence_provenance", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("confirmation_transition", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_analytics_events_evidence_kind",
        "analytics_events",
        ["evidence_kind"],
    )
    op.create_index(
        "ix_analytics_events_confirmation_transition",
        "analytics_events",
        ["confirmation_transition"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_analytics_events_confirmation_transition",
        table_name="analytics_events",
    )
    op.drop_index(
        "ix_analytics_events_evidence_kind",
        table_name="analytics_events",
    )
    op.drop_column("analytics_events", "confirmation_transition")
    op.drop_column("analytics_events", "evidence_provenance")
    op.drop_column("analytics_events", "evidence_kind")
