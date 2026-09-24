"""Run employer-ATS ingestion once, right now, for every governed source (#323).

Usage:
    python -m app.scripts.ingest_ats_sources

Ingests every `employer_ats` source with `terms_status="accepted"` and
`kill_switch=False` (typically produced by `seed_ats_sources`), one source at
a time, isolating failures so one dead board never stops the rest. Prints a
per-source summary and exits non-zero only if every source failed.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import SessionLocal
from app.services.ats_ingestion import run_ats_ingestion

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("ingest_ats_sources")


async def main() -> int:
    db = SessionLocal()
    try:
        summary = await run_ats_ingestion(db)
    finally:
        db.close()

    for outcome in summary.outcomes:
        logger.info(
            "%s (%s): fetched=%d stored=%d deduplicated=%d skipped=%d errored=%d",
            outcome.source_key,
            outcome.provider,
            outcome.fetched,
            outcome.stored,
            outcome.deduplicated,
            outcome.skipped,
            outcome.errored,
        )
    for source_key, error in summary.failures.items():
        logger.warning("%s: FAILED - %s", source_key, error)

    logger.info(
        "\nDone. sources_ok=%d sources_failed=%d",
        len(summary.outcomes),
        len(summary.failures),
    )
    if summary.outcomes:
        return 0
    return 1 if summary.failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
