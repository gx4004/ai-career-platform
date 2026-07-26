"""Populated PostgreSQL round-trip for the #191 submission migration."""

from __future__ import annotations

import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from alembic import command

PARENT = "e8b4d6c1f3a9"
REVISION = "f9c5e7d2a4b8"


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    config = Config("alembic.ini")
    command.upgrade(config, PARENT)
    engine = create_engine(database_url)

    with engine.begin() as connection:
        connection.execute(text("UPDATE application_packets SET decision='accepted' WHERE id='p1'"))
        connection.execute(
            text(
                "INSERT INTO packet_approval_snapshots "
                "(id,user_id,packet_id,campaign_id,listing_id,role_key,destination_url,"
                "content_json,content_sha256,created_at) VALUES "
                "('pa191','u1','p1','w1','l1','role:191',NULL,'{}',repeat('c',64),now())"
            )
        )

    command.upgrade(config, REVISION)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO submission_dispatch_claims "
                "(idempotency_key,user_id,packet_approval_snapshot_id,"
                "discovery_source_id,authorization_grant_id,snapshot_content_sha256,"
                "contract_version,contract_sha256,submitted_fields_json,submitted_fields_sha256,"
                "accepted_source_codes_json,created_at) VALUES "
                "('submission:v1:test','u1','pa191','s1','grant-1',repeat('c',64),"
                "'fixture/v1',repeat('e',64),'{}',repeat('d',64),'[\"accepted\"]',now())"
            )
        )
        connection.execute(
            text(
                "INSERT INTO submission_records "
                "(id,user_id,packet_approval_snapshot_id,discovery_source_id,"
                "authorization_grant_id,idempotency_key,snapshot_content_sha256,"
                "contract_version,contract_sha256,submitted_fields_json,submitted_fields_sha256,"
                "source_confirmation_id,submitted_at) VALUES "
                "('sr1','u1','pa191','s1','grant-1','submission:v1:test',"
                "repeat('c',64),'fixture/v1',repeat('e',64),'{}',repeat('d',64),"
                "'confirmation-1',now())"
            )
        )

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO submission_dispatch_claims "
                    "(idempotency_key,user_id,packet_approval_snapshot_id,"
                    "discovery_source_id,authorization_grant_id,snapshot_content_sha256,"
                    "contract_version,contract_sha256,submitted_fields_json,submitted_fields_sha256,"
                    "accepted_source_codes_json,created_at) VALUES "
                    "('submission:v1:test','u1','pa191','s1','grant-1',repeat('c',64),"
                    "'fixture/v1',repeat('e',64),'{}',repeat('d',64),"
                    "'[\"accepted\"]',now())"
                )
            )
    except DBAPIError:
        pass
    else:
        raise AssertionError("duplicate dispatch claim was accepted")

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE submission_records SET source_confirmation_id='changed' WHERE id='sr1'"
                )
            )
    except DBAPIError as error:
        assert "immutable" in str(error).lower()
    else:
        raise AssertionError("immutable submission record allowed an update")

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE submission_dispatch_claims SET contract_version='changed' "
                    "WHERE idempotency_key='submission:v1:test'"
                )
            )
    except DBAPIError as error:
        assert "immutable" in str(error).lower()
    else:
        raise AssertionError("immutable dispatch claim allowed an update")

    with engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id='u1'"))
        assert connection.execute(text("SELECT count(*) FROM submission_records")).scalar_one() == 0
        assert (
            connection.execute(text("SELECT count(*) FROM submission_dispatch_claims")).scalar_one()
            == 0
        )

    command.downgrade(config, PARENT)
    tables = set(inspect(engine).get_table_names())
    assert "submission_records" not in tables
    assert "submission_dispatch_claims" not in tables
    with engine.begin() as connection:
        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM pg_proc WHERE proname='prevent_submission_record_update'"
                )
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM pg_proc "
                    "WHERE proname='prevent_submission_dispatch_claim_update'"
                )
            ).scalar_one()
            == 0
        )
    engine.dispose()


if __name__ == "__main__":
    main()
