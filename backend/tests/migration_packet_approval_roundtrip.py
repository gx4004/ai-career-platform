"""Populated PostgreSQL round-trip for the complex #185 migration.

Invoked explicitly by CI before the normal empty-head smoke; it owns the otherwise
empty CI database and leaves it at the migration's parent revision.
"""

from __future__ import annotations

import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from alembic import command

PARENT = "d7a2c4f9e6b1"
REVISION = "e8b4d6c1f3a9"


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    config = Config("alembic.ini")
    command.upgrade(config, PARENT)
    engine = create_engine(database_url)

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id,email,is_active,created_at,token_version) "
                "VALUES ('u1','migration@example.com',true,now(),0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO discovery_sources "
                "(id,source_key,display_name,source_family,owner,allowed_behavior,"
                "rate_limit_per_minute,attribution_rule,retention_days,created_at,updated_at) "
                "VALUES ('s1','migration','Migration','licensed','Ops','feed',10,"
                "'Show link',30,now(),now())"
            )
        )
        connection.execute(
            text(
                "INSERT INTO discovered_listings "
                "(id,content_sha256,title,company,description,created_at) "
                "VALUES ('l1',repeat('a',64),'Engineer','Café','Role',now())"
            )
        )
        connection.execute(
            text(
                "INSERT INTO discovered_listing_attributions "
                "(id,listing_id,source_id,source_listing_key,source_url,retrieved_at) "
                "VALUES ('a1','l1','s1','role-1','https://jobs.example/role-1',now())"
            )
        )
        connection.execute(
            text(
                "INSERT INTO workspaces "
                "(id,user_id,label,is_pinned,created_at,updated_at,company,role,"
                "discovery_listing_id) VALUES "
                "('w1','u1','Migration',false,now(),now(),'Café','Engineer','l1')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO application_packets "
                "(id,user_id,campaign_id,listing_id,match_rationale,unresolved_questions,"
                "status,estimated_cost_usd,created_at,updated_at,gate_state,decision) "
                "VALUES ('p1','u1','w1','l1',CAST(:rationale AS json),"
                "CAST(:questions AS json),'prepared',0.02,now(),now(),'passed','accepted')"
            ),
            {
                "rationale": '{"composite_score":80,"signals":[],"matched_rules":[]}',
                "questions": "[]",
            },
        )
        connection.execute(
            text(
                "INSERT INTO campaign_submission_snapshots "
                "(id,workspace_id,content_json,content_sha256,created_at) VALUES "
                "('cs1','w1',:content,repeat('b',64),now())"
            ),
            {"content": '{"listing":{"company":"Café","title":"Engineer"}}'},
        )

    command.upgrade(config, REVISION)
    with engine.begin() as connection:
        packet = connection.execute(
            text(
                "SELECT decision, listing_attribution_id FROM application_packets "
                "WHERE id='p1'"
            )
        ).one()
        assert packet.decision == "pending"
        assert packet.listing_attribution_id is None
        connection.execute(
            text(
                "UPDATE application_packets SET listing_attribution_id='a1' "
                "WHERE id='p1'"
            )
        )
        connection.execute(
            text("DELETE FROM discovered_listing_attributions WHERE id='a1'")
        )
        survived = connection.execute(
            text(
                "SELECT listing_attribution_id FROM application_packets WHERE id='p1'"
            )
        ).one()
        assert survived.listing_attribution_id is None
        role_key = connection.execute(
            text("SELECT role_key FROM campaign_submission_snapshots WHERE id='cs1'")
        ).scalar_one()
        assert role_key.startswith("role:v1:") and len(role_key) == 72
        connection.execute(
            text(
                "INSERT INTO packet_approval_snapshots "
                "(id,user_id,packet_id,campaign_id,listing_id,role_key,destination_url,"
                "content_json,content_sha256,created_at) VALUES "
                "('pa1','u1','p1','w1','l1','role:test',"
                "'https://jobs.example/role-1','{}',repeat('c',64),now())"
            )
        )

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE packet_approval_snapshots SET content_json='changed' "
                    "WHERE id='pa1'"
                )
            )
    except DBAPIError as error:
        assert "immutable" in str(error).lower()
    else:
        raise AssertionError("immutable snapshot trigger allowed an update")

    command.downgrade(config, PARENT)
    inspector = inspect(engine)
    assert "packet_approval_snapshots" not in inspector.get_table_names()
    assert "listing_attribution_id" not in {
        column["name"] for column in inspector.get_columns("application_packets")
    }
    with engine.begin() as connection:
        assert connection.execute(
            text("SELECT decision FROM application_packets WHERE id='p1'")
        ).scalar_one() == "pending"
    engine.dispose()


if __name__ == "__main__":
    main()
