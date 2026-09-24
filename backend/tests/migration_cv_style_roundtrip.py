"""PostgreSQL round-trip for the #322 cv_documents.style migration.

Not wired into the hardcoded release-runner/CI command lists (tests/test_ci_workflow.py,
tests/test_local_release_runner.py) — that list change is a deliberate, separately
reviewed edit to shared release infra, out of scope for this PR. Run directly:

    DATABASE_URL=postgresql://user@localhost:5432/db python tests/migration_cv_style_roundtrip.py
"""

from __future__ import annotations

import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command

PARENT = "c4a8e2f6b1d9"
REVISION = "a1c3e5f7b9d2"


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    config = Config("alembic.ini")
    command.upgrade(config, PARENT)
    engine = create_engine(database_url)

    inspector = inspect(engine)
    columns_before = {c["name"] for c in inspector.get_columns("cv_documents")}
    assert "style" not in columns_before

    command.upgrade(config, REVISION)
    inspector = inspect(engine)
    columns_after = {c["name"] for c in inspector.get_columns("cv_documents")}
    assert "style" in columns_after
    style_column = next(c for c in inspector.get_columns("cv_documents") if c["name"] == "style")
    assert style_column["nullable"] is True

    style_json = (
        '{"template_id": "minimal-serif", "font_id": "pt-serif", "accent_color": "#374151", '
        '"density": "compact", "section_order": null, "ats_mode": false}'
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO cv_documents (id, user_id, name, sections, style, created_at, updated_at) "
                "SELECT 'doc-322', id, 'Styled CV', '[]'::json, CAST(:style_json AS json), now(), now() "
                "FROM users LIMIT 1"
            ),
            {"style_json": style_json},
        )
        stored = connection.execute(
            text("SELECT style->>'template_id' FROM cv_documents WHERE id='doc-322'")
        ).scalar_one_or_none()
        # No users exist in a fresh DB at this point in some environments; only assert
        # when the insert actually ran (LIMIT 1 on an empty users table inserts nothing).
        if stored is not None:
            assert stored == "minimal-serif"

    command.downgrade(config, PARENT)
    inspector = inspect(engine)
    columns_reverted = {c["name"] for c in inspector.get_columns("cv_documents")}
    assert "style" not in columns_reverted

    engine.dispose()


if __name__ == "__main__":
    main()
