"""One CV render at a time per user (the capacity model is in docs/threat-model.md).

The Chromium pool has two render slots for everyone. Without a per-user limit one person's
previews (a fit search is several renders), gallery and quality checks could hold both. A
*lane* lets each user run one preview, thumbnail or quality render at a time; the others
wait up to ``QUEUE_TIMEOUT_SECONDS`` and then answer "busy" (503).

A newer preview supersedes the user's older one: the older ticket is cancelled, and the
render loop checks its ticket between renders (``ticket.check``), so the older request stops
at its next render boundary and the newer one takes the lane. A quality check or a gallery
is never cancelled by a preview; it is simply waited for.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager

from app.services.cv_chromium import QUEUE_TIMEOUT_SECONDS, RenderBusyError, RenderCancelledError

_POLL_SECONDS = 0.02


class RenderTicket:
    """One request's claim on its user's lane; ``cancel`` asks it to stop at the next check."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self._cancelled = threading.Event()

    def cancel(self) -> None:
        self._cancelled.set()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    def check(self) -> None:
        """Raise ``RenderCancelledError`` when this request was superseded or abandoned."""
        if self._cancelled.is_set():
            raise RenderCancelledError()


class _Lane:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.holder: RenderTicket | None = None
        self.waiting: set[RenderTicket] = set()


class RenderLanes:
    def __init__(self, wait_seconds: float = QUEUE_TIMEOUT_SECONDS) -> None:
        self.wait_seconds = wait_seconds
        self._lanes: dict[str, _Lane] = {}
        self._mutex = threading.Lock()

    @contextmanager
    def hold(
        self, user_id: str, kind: str, *, supersede: bool = False, ticket: RenderTicket | None = None
    ) -> Iterator[RenderTicket]:
        """Run one render for ``user_id``. Blocking: call it off the event loop.

        ``supersede`` cancels the user's in-flight and waiting renders of the same ``kind``.
        Raises ``RenderBusyError`` after waiting ``wait_seconds`` for the lane, and
        ``RenderCancelledError`` when this ticket is superseded while it waits."""
        ticket = ticket or RenderTicket(kind)
        with self._mutex:
            lane = self._lanes.setdefault(user_id, _Lane())
            if supersede:
                for other in (lane.holder, *lane.waiting):
                    if other is not None and other.kind == kind:
                        other.cancel()
            lane.waiting.add(ticket)
        acquired = False
        try:
            deadline = time.monotonic() + self.wait_seconds
            while not acquired:
                ticket.check()
                acquired = lane.lock.acquire(timeout=_POLL_SECONDS)
                if not acquired and time.monotonic() >= deadline:
                    raise RenderBusyError()
            with self._mutex:
                lane.waiting.discard(ticket)
                lane.holder = ticket
            ticket.check()
            yield ticket
        finally:
            with self._mutex:
                lane.waiting.discard(ticket)
                if acquired:
                    lane.holder = None
                    lane.lock.release()
                if lane.holder is None and not lane.waiting and self._lanes.get(user_id) is lane:
                    del self._lanes[user_id]

    def busy(self, user_id: str) -> bool:
        with self._mutex:
            lane = self._lanes.get(user_id)
            return lane is not None and lane.holder is not None

    def waiting(self, user_id: str) -> int:
        with self._mutex:
            lane = self._lanes.get(user_id)
            return 0 if lane is None else len(lane.waiting)


render_lanes = RenderLanes()
