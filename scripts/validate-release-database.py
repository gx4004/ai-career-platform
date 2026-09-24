#!/usr/bin/env python3
"""Validate the explicitly selected disposable local-release database."""

from __future__ import annotations

import argparse
import os
import re
import sys
from urllib.parse import unquote, urlsplit

URL_ENVIRONMENT_VARIABLE = "LOCAL_RELEASE_DATABASE_URL"
DATABASE_NAME_PROFILES = {
    "release": (
        re.compile(r"^cw_local_release(?:_[a-z0-9]+)*$"),
        "cw_local_release or start with cw_local_release_",
    ),
    "authorization-concurrency": (
        re.compile(r"^codex_submission_authorization_concurrency_[a-z0-9]+$"),
        "start with codex_submission_authorization_concurrency_",
    ),
}
POSTGRESQL_SCHEMES = {
    "postgres",
    "postgresql",
    "postgresql+psycopg2",
}


def validated_database_name(database_url: str, profile: str = "release") -> str:
    parsed = urlsplit(database_url)
    if parsed.scheme not in POSTGRESQL_SCHEMES:
        raise ValueError("the disposable database URL must use PostgreSQL")
    if parsed.hostname is None:
        raise ValueError("the disposable database URL must include a host")

    database_name = unquote(parsed.path.removeprefix("/"))
    name_pattern, requirement = DATABASE_NAME_PROFILES[profile]
    if not name_pattern.fullmatch(database_name):
        raise ValueError(f"the database name must {requirement}")
    return database_name


def assert_database_is_empty(database_url: str, expected_name: str) -> None:
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import SQLAlchemyError

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            actual_name = connection.execute(text("SELECT current_database()")).scalar_one()
            if actual_name != expected_name:
                raise ValueError(
                    "the connected PostgreSQL database name does not match the guarded URL"
                )
            object_count = connection.execute(
                text(
                    "SELECT count(*) FROM pg_class AS class "
                    "JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace "
                    "WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema') "
                    "AND namespace.nspname NOT LIKE 'pg_toast%' "
                    "AND class.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')"
                )
            ).scalar_one()
            if object_count:
                raise ValueError(
                    "the disposable PostgreSQL database is not empty; supply a fresh database"
                )
    except SQLAlchemyError as error:
        raise ValueError(
            f"could not inspect disposable PostgreSQL database ({type(error).__name__})"
        ) from None
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=DATABASE_NAME_PROFILES, default="release")
    parser.add_argument("--require-empty", action="store_true")
    arguments = parser.parse_args()

    database_url = os.environ.get(URL_ENVIRONMENT_VARIABLE, "")
    if not database_url:
        print("local release: explicit disposable database URL is missing", file=sys.stderr)
        return 2

    try:
        database_name = validated_database_name(database_url, arguments.profile)
        if arguments.require_empty:
            assert_database_is_empty(database_url, database_name)
    except ValueError as error:
        print(f"local release: {error}", file=sys.stderr)
        return 2

    if arguments.require_empty:
        print(f"Validated empty disposable database: {database_name}")
    else:
        print(f"Validated disposable database name: {database_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
