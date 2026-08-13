"""Populated PostgreSQL round trip for the nullable R10 metric column."""

from __future__ import annotations

import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command

PARENT = "b2e7a9c4d6f1"
REVISION = "c4a8e2f6b1d9"


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    config = Config("alembic.ini")
    command.upgrade(config, PARENT)
    engine = create_engine(database_url)

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO analytics_events (id,event_name,level,created_at) VALUES "
                "('metric-null','landing_page_viewed','info',now()),"
                "('metric-sample','r10_database_snapshot','info',now())"
            )
        )

    command.upgrade(config, REVISION)
    with engine.begin() as connection:
        rows = connection.execute(
            text("SELECT id,metric_value FROM analytics_events ORDER BY id")
        ).all()
        assert rows == [("metric-null", None), ("metric-sample", None)]
        connection.execute(
            text(
                "UPDATE analytics_events SET metric_value=42.500000 "
                "WHERE id='metric-sample'"
            )
        )

    command.downgrade(config, PARENT)
    assert "metric_value" not in {
        column["name"] for column in inspect(engine).get_columns("analytics_events")
    }
    with engine.begin() as connection:
        assert connection.execute(
            text("SELECT count(*) FROM analytics_events WHERE id LIKE 'metric-%'")
        ).scalar_one() == 2
    engine.dispose()


if __name__ == "__main__":
    main()
