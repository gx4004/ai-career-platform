"""Recurring retention job for product-owned discovered listings.

The lightest mechanism consistent with this single-process FastAPI app: an
app-startup background asyncio task that runs the pure expiry query on a fixed
interval, with no manual intervention and no new infrastructure.
Deletion logic remains in the owning services; this module only schedules it.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import SessionLocal
from app.services.discovered_listings import expire_discovered_listings

logger = logging.getLogger("app.retention")

DISCOVERED_LISTING_EXPIRY_INTERVAL_SECONDS = 24 * 60 * 60


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
