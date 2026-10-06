"""B14 item 5: a CV version's name and target role can be edited; its snapshot cannot.

The guard is a Postgres trigger, which the in-memory SQLite suite cannot run, so this
pins (a) the PATCH contract at the HTTP seam and (b) the SQL the head migration installs.
The trigger itself was verified against a scratch Postgres database (see the B14 report).
"""

from __future__ import annotations

import re
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

PREFIX = "/api/v1/cv-documents"


def _script() -> ScriptDirectory:
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    return ScriptDirectory.from_config(config)


class _RecordingOp:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, statement) -> None:
        self.sql.append(str(statement))


def _trigger_function_sql(direction: str) -> str:
    """The prevent_cv_variant_update() body the newest revision that defines it installs."""
    for revision in _script().walk_revisions():  # newest first
        if "prevent_cv_variant_update" not in Path(revision.path).read_text():
            continue
        module = revision.module
        recorder = _RecordingOp()
        original = module.op
        module.op = recorder
        try:
            getattr(module, direction)()
        finally:
            module.op = original
        bodies = [sql for sql in recorder.sql if "prevent_cv_variant_update" in sql and "FUNCTION" in sql]
        assert bodies, f"{revision.revision} mentions the trigger but installs no function"
        return bodies[-1]
    raise AssertionError("no revision defines prevent_cv_variant_update()")


def test_head_trigger_allows_name_and_target_role_but_guards_the_snapshot():
    body = _trigger_function_sql("upgrade")

    assert "CREATE OR REPLACE FUNCTION prevent_cv_variant_update()" in body
    for frozen in ("sections", "document_id", "created_at", "tailoring_request_id", "id"):
        assert re.search(rf"NEW\.{frozen}(::text)? IS DISTINCT FROM OLD\.{frozen}", body), frozen
    assert "NEW.name" not in body and "NEW.target_role" not in body
    assert "RETURN NEW" in body
    assert "CV variant snapshots are immutable" in body


def test_downgrade_restores_the_blanket_guard():
    body = _trigger_function_sql("downgrade")

    assert "RAISE EXCEPTION 'CV variant snapshots are immutable'" in body
    assert "IS DISTINCT FROM" not in body


def test_renaming_a_version_and_setting_its_target_role_succeeds(client, auth_headers):
    document = client.post(
        PREFIX,
        json={"name": "Main CV", "sections": []},
        headers=auth_headers,
    )
    assert document.status_code == 201, document.text
    doc_id = document.json()["id"]
    variant = client.post(f"{PREFIX}/{doc_id}/variants", json={"name": "Backend"}, headers=auth_headers)
    assert variant.status_code == 201, variant.text
    variant_id = variant.json()["id"]

    response = client.patch(
        f"{PREFIX}/{doc_id}/variants/{variant_id}",
        json={"name": "Backend (Acme)", "target_role": "Senior Backend Engineer"},
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Backend (Acme)"
    assert response.json()["target_role"] == "Senior Backend Engineer"
