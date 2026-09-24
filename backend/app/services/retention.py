"""Recurring retention jobs for analytics and product-owned discovered listings.

The lightest mechanism consistent with this single-process FastAPI app: an
app-startup background asyncio task that runs the pure `prune_activation_events`
queries on fixed intervals, with no manual intervention and no new infrastructure.
Deletion logic remains in the owning services; this module only schedules it.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import SessionLocal
from app.services.analytics import prune_activation_events
from app.services.discovered_listings import expire_discovered_listings

logger = logging.getLogger("app.retention")

# Prune once a day. The 180-day window is far larger than the interval, so the
# exact cadence is not sensitive; daily keeps the table trimmed without adding
# meaningful load.
ACTIVATION_PRUNE_INTERVAL_SECONDS = 24 * 60 * 60
DISCOVERED_LISTING_EXPIRY_INTERVAL_SECONDS = 24 * 60 * 60


def _prune_activation_events_once() -> int:
    """Open a short-lived session, run the prune, and never raise into the loop."""
    db = SessionLocal()
    try:
        deleted = prune_activation_events(db)
        if deleted:
            logger.info("activation_events retention prune removed rows=%d", deleted)
        return deleted
    except Exception as exc:  # noqa: BLE001 — a scheduled prune must not crash the loop
        try:
            db.rollback()
        except Exception:  # noqa: BLE001 — rollback failure must not mask the original
            pass
        logger.warning(
            "activation_events retention prune failed error_type=%s",
            type(exc).__name__,
        )
        return 0
    finally:
        db.close()


async def run_activation_prune_scheduler(
    interval_seconds: int = ACTIVATION_PRUNE_INTERVAL_SECONDS,
) -> None:
    """Run the prune on startup, then once per ``interval_seconds`` forever.

    The synchronous DB delete runs in a worker thread so it never blocks the
    event loop. Cancellation (app shutdown) propagates out of `asyncio.sleep`.
    """
    while True:
        await asyncio.to_thread(_prune_activation_events_once)
        await asyncio.sleep(interval_seconds)


def _expire_discovered_listings_once() -> int:
    db = SessionLocal()
    try:
        result = expire_discovered_listings(db)
        if result.attributions_deleted or result.listings_deleted:
            logger.info(
                "discovered listings expiry removed attributions=%d listings=%d",
                result.attributions_deleted,
                result.listings_deleted,
            )
        return result.attributions_deleted
    except Exception as exc:  # noqa: BLE001 — scheduled expiry stays fail-safe
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        logger.warning(
            "discovered listings expiry failed error_type=%s",
            type(exc).__name__,
        )
        return 0
    finally:
        db.close()


async def run_discovered_listing_expiry_scheduler(
    interval_seconds: int = DISCOVERED_LISTING_EXPIRY_INTERVAL_SECONDS,
) -> None:
    while True:
        await asyncio.to_thread(_expire_discovered_listings_once)
        await asyncio.sleep(interval_seconds)
