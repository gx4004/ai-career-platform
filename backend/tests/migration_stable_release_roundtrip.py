"""Populated stable-release -> current-head -> stable -> head PostgreSQL proof.

The stable promotion branch currently ends at ``e4a7b2d918f3``. This rehearsal
owns an explicitly disposable database, seeds the product data that exists on
that branch, proves the cumulative migration body preserves it in both
directions, and returns the database to the stable revision so later focused
migration rehearsals can advance through their own clusters.
"""

from __future__ import annotations

import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from alembic import command

STABLE_DEPLOY_REVISION = "e4a7b2d918f3"
LOCAL_RELEASE_DATABASE_PREFIX = "cw_local_release"


def _require_disposable_database(database_url: str) -> None:
    name = make_url(database_url).database or ""
    if name != LOCAL_RELEASE_DATABASE_PREFIX and not name.startswith(
        f"{LOCAL_RELEASE_DATABASE_PREFIX}_"
    ):
        raise RuntimeError(
            "stable-release rehearsal requires an explicitly guarded "
            f"{LOCAL_RELEASE_DATABASE_PREFIX} database"
        )


def _assert_stable_rows(engine) -> None:
    with engine.connect() as connection:
        user = connection.execute(
            text(
                "SELECT email, full_name, is_active, is_admin, token_version "
                "FROM users WHERE id='stable-user'"
            )
        ).one()
        assert tuple(user) == (
            "stable-release@example.invalid",
            "Stable Release Fixture",
            True,
            False,
            7,
        )

        workspace = connection.execute(
            text(
                "SELECT label, is_pinned FROM workspaces "
                "WHERE id='stable-workspace'"
            )
        ).one()
        assert tuple(workspace) == ("Stable target", True)

        runs = connection.execute(
            text(
                "SELECT id, workspace_id, parent_run_id, result_payload "
                "FROM tool_runs WHERE user_id='stable-user' ORDER BY created_at"
            )
        ).all()
        assert len(runs) == 2
        assert runs[0].id == "stable-run-parent"
        assert runs[0].workspace_id == "stable-workspace"
        assert runs[0].parent_run_id is None
        assert runs[0].result_payload == {"score": 72}
        assert runs[1].id == "stable-run-child"
        assert runs[1].parent_run_id == "stable-run-parent"
        assert runs[1].result_payload == {"score": 81}


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    _require_disposable_database(database_url)
    config = Config("alembic.ini")

    command.upgrade(config, STABLE_DEPLOY_REVISION)
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id,email,hashed_password,full_name,is_active,is_admin,created_at,token_version) "
                "VALUES ('stable-user','stable-release@example.invalid','fixture-hash',"
                "'Stable Release Fixture',true,false,now(),7)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO workspaces "
                "(id,user_id,label,is_pinned,created_at,updated_at) "
                "VALUES ('stable-workspace','stable-user','Stable target',true,now(),now())"
            )
        )
        connection.execute(
            text(
                "INSERT INTO tool_runs "
                "(id,user_id,tool_name,label,is_favorite,result_payload,created_at,"
                "workspace_id,parent_run_id,feedback_text) VALUES "
                "('stable-run-parent','stable-user','job-match','Initial',false,"
                "CAST(:parent_payload AS json),now() - interval '1 minute',"
                "'stable-workspace',NULL,NULL),"
                "('stable-run-child','stable-user','job-match','Regenerated',true,"
                "CAST(:child_payload AS json),now(),'stable-workspace',"
                "'stable-run-parent','make it clearer')"
            ),
            {"parent_payload": '{"score":72}', "child_payload": '{"score":81}'},
        )

    _assert_stable_rows(engine)

    command.upgrade(config, "head")
    _assert_stable_rows(engine)
    current_tables = set(inspect(engine).get_table_names())
    assert {"evidence_items", "cv_documents", "application_packets"} <= current_tables

    command.downgrade(config, STABLE_DEPLOY_REVISION)
    _assert_stable_rows(engine)
    stable_tables = set(inspect(engine).get_table_names())
    assert stable_tables == {"alembic_version", "tool_runs", "users", "workspaces"}

    command.upgrade(config, "head")
    _assert_stable_rows(engine)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() \
            == "c4a8e2f6b1d9"

    command.downgrade(config, STABLE_DEPLOY_REVISION)
    _assert_stable_rows(engine)
    engine.dispose()


if __name__ == "__main__":
    main()
