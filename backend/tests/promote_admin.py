"""Promote a user to admin for the screenshots harness (E2E only).

Not imported by the production app. There is deliberately no HTTP
admin-bootstrap endpoint — `get_current_admin` requires an existing admin,
so nothing can self-promote over the API (D-048: privileged access is a
server-side decision, never a client-supplied one). The frontend screenshots
harness (frontend/e2e/screenshots.spec.ts) needs one admin account to capture
the admin surfaces, so it flips `is_admin` directly in the database this
process points at via DATABASE_URL — the same env var tests.e2e_server reads.

Usage: python -m tests.promote_admin <email>
Prints "promoted" and exits 0 on success, "not-found" and exits 1 if no user
matches, so the caller can skip the admin screenshots instead of failing.
"""

from __future__ import annotations

import sys

from sqlalchemy import create_engine, text

from app.config import settings


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.promote_admin <email>", file=sys.stderr)
        return 2

    email = argv[0]
    engine = create_engine(settings.DATABASE_URL)
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE users SET is_admin = true WHERE email = :email"),
                {"email": email},
            )
    finally:
        engine.dispose()

    if result.rowcount != 1:
        print("not-found")
        return 1

    print("promoted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
