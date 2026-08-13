"""Two-session PostgreSQL proof for submission-authorization idempotency.

Run only against an explicitly named disposable database::

    DATABASE_URL=postgresql+psycopg2:///codex_submission_authorization_concurrency_<id> \
      python tests/postgres_submission_authorization_concurrency.py
"""

from __future__ import annotations

import os
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import create_engine, event, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.discovery_source import DiscoverySource
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.submission_source import SubmissionSourceGovernance
from app.models.user import User
from app.schemas.submission_authorizations import VerifiedSourceAuthorization
from app.services.submission_authorizations import record_submission_authorization

_DATABASE_PREFIX = "codex_submission_authorization_concurrency_"
_USER_ID = "authorization-concurrency-user"
_SOURCE_ID = "authorization-concurrency-source"
_SOURCE_KEY = "authorization-concurrency-fixture"


def _authorization(mechanism: str) -> VerifiedSourceAuthorization:
    return VerifiedSourceAuthorization(
        mechanism=mechanism,
        scope="submit_applications",
        user_consent_confirmed=True,
    )


def _seed(session) -> None:
    now = datetime.now(UTC)
    session.add_all(
        [
            User(
                id=_USER_ID,
                email="authorization-concurrency@example.invalid",
                is_active=True,
                token_version=0,
            ),
            DiscoverySource(
                id=_SOURCE_ID,
                source_key=_SOURCE_KEY,
                display_name="Authorization Concurrency Fixture",
                source_family="employer_ats",
                owner="Tests",
                terms_status="accepted",
                terms_reviewed_at=now,
                terms_reviewed_by="test-reviewer",
                allowed_behavior="ats_integration",
                endpoint_url="https://authorization-concurrency.invalid/applications",
                allowed_query_parameters=[],
                robots_policy="not_applicable",
                rate_limit_per_minute=10,
                attribution_rule="Synthetic fixture only",
                retention_days=30,
                kill_switch=False,
            ),
            SubmissionSourceGovernance(
                id="authorization-concurrency-governance",
                discovery_source_id=_SOURCE_ID,
                legal_terms_status="accepted",
                legal_terms_reviewed_at=now,
                legal_terms_reviewed_by="test-reviewer",
                contract_status="verified",
                contract_version="authorization-concurrency/v1",
                contract_fields=[
                    {
                        "source_field": "job_title",
                        "packet_field": "listing.title",
                        "required": True,
                    }
                ],
                contract_formats=[
                    {"source_field": "job_title", "kind": "utf8_text"}
                ],
                contract_error_semantics=[
                    {
                        "source_code": "accepted",
                        "meaning": "accepted",
                        "handling": "confirm_success",
                    }
                ],
                contract_reviewed_at=now,
                contract_reviewed_by="test-reviewer",
                promoted=True,
                promoted_at=now,
                promoted_by="test-reviewer",
                kill_switch=False,
            ),
        ]
    )
    session.commit()


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must name an explicit disposable database")
    database_name = make_url(database_url).database or ""
    if not database_name.startswith(_DATABASE_PREFIX):
        raise RuntimeError(
            f"Refusing ambiguous database {database_name!r}; expected prefix "
            f"{_DATABASE_PREFIX!r}"
        )

    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    lookup_barrier = threading.Barrier(2)

    def synchronize_grant_lookup(
        _connection,
        _cursor,
        statement,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        normalized = " ".join(statement.lower().split())
        if (
            threading.current_thread().name.startswith("authorization-callback-")
            and normalized.startswith("select")
            and "from submission_authorization_grants" in normalized
        ):
            try:
                lookup_barrier.wait(timeout=0.75)
            except threading.BrokenBarrierError:
                # After the fix, the stable owner-row lock prevents the second
                # session from reaching this lookup until the winner commits.
                pass

    event.listen(engine, "after_cursor_execute", synchronize_grant_lookup)
    try:
        with Session() as session:
            _seed(session)

        start = threading.Barrier(2)
        result_ids: list[str] = []
        errors: list[Exception] = []

        def callback() -> None:
            try:
                start.wait(timeout=5)
                with Session() as session:
                    grant = record_submission_authorization(
                        session,
                        user_id=_USER_ID,
                        source_key=_SOURCE_KEY,
                        authorization=_authorization("oauth2_authorization_code"),
                    )
                    result_ids.append(grant.id)
            except Exception as error:  # pragma: no cover - asserted below
                errors.append(error)

        workers = [
            threading.Thread(
                target=callback,
                name=f"authorization-callback-{index}",
            )
            for index in range(2)
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=10)

        assert all(not worker.is_alive() for worker in workers), "callback deadlock"
        assert not errors, errors
        assert len(result_ids) == 2
        assert len(set(result_ids)) == 1, result_ids

        with Session() as session:
            rows = session.query(SubmissionAuthorizationGrant).all()
            assert len(rows) == 1
            assert rows[0].id == result_ids[0]

            replacement = record_submission_authorization(
                session,
                user_id=_USER_ID,
                source_key=_SOURCE_KEY,
                authorization=_authorization("oauth2_device_authorization"),
            )
            assert replacement.id != result_ids[0]
            assert replacement.mechanism == "oauth2_device_authorization"
            assert (
                session.query(func.count(SubmissionAuthorizationGrant.id)).scalar()
                == 1
            )

        print(
            "submission authorization concurrency proof passed: "
            "identical callbacks shared one grant; changed mechanism replaced it"
        )
    finally:
        event.remove(engine, "after_cursor_execute", synchronize_grant_lookup)
        engine.dispose()


if __name__ == "__main__":
    main()
