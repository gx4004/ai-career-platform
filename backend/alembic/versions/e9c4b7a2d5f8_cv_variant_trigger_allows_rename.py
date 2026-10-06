"""CV variant trigger: allow renaming and retargeting, keep the snapshot immutable

The squash revision's trigger refused every UPDATE on cv_variants, so renaming a
version (PATCH /cv-documents/{id}/variants/{variant_id}) always failed with a 500.
Only the snapshot (its sections, document, origin and creation time) is frozen;
name and target_role are labels the owner may edit.

Revision ID: e9c4b7a2d5f8
Revises: d7a3b9e2c4f1
Create Date: 2026-10-06 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e9c4b7a2d5f8'
down_revision: str | None = 'd7a3b9e2c4f1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # sections is JSON (no equality operator), so it is compared as text.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_cv_variant_update() RETURNS trigger AS $$
        BEGIN
            IF NEW.id IS DISTINCT FROM OLD.id
                OR NEW.document_id IS DISTINCT FROM OLD.document_id
                OR NEW.tailoring_request_id IS DISTINCT FROM OLD.tailoring_request_id
                OR NEW.sections::text IS DISTINCT FROM OLD.sections::text
                OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                RAISE EXCEPTION 'CV variant snapshots are immutable';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_cv_variant_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'CV variant snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
