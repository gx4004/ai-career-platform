"""Print CV HTML to PDF with one shared headless Chromium per worker process.

Design (spec docs/cv-templates-spec.md 3.1):

* One browser per process, started lazily on the first render and relaunched when
  it has crashed. One context and page per render, so nothing leaks between CVs.
* Playwright's async API runs on a private event loop in a daemon thread. The
  routers call this module from threadpool threads (sync endpoints, and
  ``run_in_threadpool``), where sync Playwright cannot be shared; a single loop
  owns the browser and any thread may submit a render with :func:`print_pdf`.
* At most ``MAX_CONCURRENT_RENDERS`` pages print at once and a render that takes
  longer than ``RENDER_TIMEOUT_SECONDS`` (queueing included) is abandoned.
* No fallback renderer: when Chromium cannot run, callers get
  :class:`CvRenderUnavailableError`, which the app maps to HTTP 503.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import threading
from collections.abc import Coroutine
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MAX_CONCURRENT_RENDERS = 2
RENDER_TIMEOUT_SECONDS = 15.0
# A page that never reaches "load" (it only has inline content) is a bug, not a wait.
_LOAD_TIMEOUT_MS = 10_000


class CvRenderUnavailableError(Exception):
    """The CV could not be printed right now. ``message`` is a plain sentence for the user."""

    message = "The PDF renderer is not available right now. Please try again in a moment."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message


class ChromiumUnavailableError(CvRenderUnavailableError):
    message = "PDF export is not available right now because the PDF renderer could not start."


class RenderTimeoutError(CvRenderUnavailableError):
    message = "The PDF took too long to prepare. Please try again in a moment."


def _no_sandbox() -> bool:
    return os.environ.get("CV_CHROMIUM_NO_SANDBOX", "").lower() in {"1", "true", "yes"}


def chromium_installed() -> bool:
    """Whether a Playwright Chromium build is on disk (cheap: starts nothing)."""
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    configured = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    roots = [Path(configured)] if configured and configured != "0" else []
    home = Path.home()
    roots += [home / ".cache" / "ms-playwright", home / "Library" / "Caches" / "ms-playwright"]
    return any(root.is_dir() and any(root.glob("chromium*-*")) for root in roots)


async def _only_inline(route) -> None:
    if route.request.url.startswith(("data:", "about:")):
        await route.continue_()
    else:
        await route.abort()


class ChromiumPool:
    """The shared browser and its render slots. Use the module-level instance."""

    def __init__(
        self,
        *,
        concurrency: int = MAX_CONCURRENT_RENDERS,
        timeout: float = RENDER_TIMEOUT_SECONDS,
    ) -> None:
        self.concurrency = concurrency
        self.timeout = timeout
        self._start_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        # Touched only on the loop thread.
        self._semaphore: asyncio.Semaphore | None = None
        self._launch_lock: asyncio.Lock | None = None
        self._playwright: Any = None
        self._browser: Any = None
        self._launch_failed = False
        self.launches = 0
        self.in_flight = 0
        self.peak_in_flight = 0

    # -- loop thread -------------------------------------------------------

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        with self._start_lock:
            if self._loop is not None and self._thread is not None and self._thread.is_alive():
                return self._loop
            loop = asyncio.new_event_loop()
            ready = threading.Event()

            def run() -> None:
                asyncio.set_event_loop(loop)
                self._semaphore = asyncio.Semaphore(self.concurrency)
                self._launch_lock = asyncio.Lock()
                self._browser = self._playwright = None
                ready.set()
                loop.run_forever()

            thread = threading.Thread(target=run, name="cv-chromium", daemon=True)
            thread.start()
            ready.wait()
            self._loop, self._thread = loop, thread
            return loop

    def _submit(self, coro: Coroutine[Any, Any, Any]):
        return asyncio.run_coroutine_threadsafe(coro, self._ensure_loop())

    # -- browser lifecycle (loop thread) -----------------------------------

    async def _get_browser(self):
        assert self._launch_lock is not None
        async with self._launch_lock:
            if self._browser is not None and self._browser.is_connected():
                return self._browser
            await self._discard_browser()
            try:
                from playwright.async_api import async_playwright

                if self._playwright is None:
                    self._playwright = await async_playwright().start()
                args = ["--disable-dev-shm-usage", "--disable-gpu"]
                if _no_sandbox():
                    args.append("--no-sandbox")
                self._browser = await self._playwright.chromium.launch(headless=True, args=args)
            except Exception as error:
                self._launch_failed = True
                logger.warning("cv chromium launch failed: %s", type(error).__name__)
                await self._discard_browser(stop_driver=True)
                raise ChromiumUnavailableError() from error
            self._launch_failed = False
            self.launches += 1
            return self._browser

    async def _discard_browser(self, *, stop_driver: bool = False) -> None:
        browser, self._browser = self._browser, None
        if browser is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(browser.close(), 5)
        if stop_driver and self._playwright is not None:
            playwright, self._playwright = self._playwright, None
            with contextlib.suppress(Exception):
                await asyncio.wait_for(playwright.stop(), 5)

    # -- rendering (loop thread) -------------------------------------------

    async def _print_once(self, html: str) -> bytes:
        browser = await self._get_browser()
        context = await browser.new_context(service_workers="block")
        try:
            page = await context.new_page()
            # The HTML is self-contained (fonts are data URIs): nothing may be fetched.
            await page.route("**/*", _only_inline)
            await page.set_content(html, wait_until="load", timeout=_LOAD_TIMEOUT_MS)
            await page.evaluate("document.fonts.ready.then(() => true)")
            return await page.pdf(prefer_css_page_size=True, print_background=True)
        finally:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(context.close(), 5)

    async def _inspect_once(self, html: str, script: str):
        browser = await self._get_browser()
        context = await browser.new_context(service_workers="block")
        try:
            page = await context.new_page()
            await page.route("**/*", _only_inline)
            await page.set_content(html, wait_until="load", timeout=_LOAD_TIMEOUT_MS)
            await page.evaluate("document.fonts.ready.then(() => true)")
            return await page.evaluate(script)
        finally:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(context.close(), 5)

    async def _print(self, html: str) -> bytes:
        assert self._semaphore is not None
        async with self._semaphore:
            self.in_flight += 1
            self.peak_in_flight = max(self.peak_in_flight, self.in_flight)
            try:
                try:
                    return await self._print_once(html)
                except CvRenderUnavailableError:
                    raise
                except Exception as error:
                    if self._browser is not None and not self._browser.is_connected():
                        # The browser died under this render: start a fresh one, once.
                        logger.warning("cv chromium crashed, restarting: %s", type(error).__name__)
                        return await self._print_once(html)
                    raise
            finally:
                self.in_flight -= 1

    async def _print_with_timeout(self, html: str) -> bytes:
        try:
            return await asyncio.wait_for(self._print(html), self.timeout)
        except TimeoutError as error:
            raise RenderTimeoutError() from error
        except CvRenderUnavailableError:
            raise
        except Exception as error:
            logger.warning("cv pdf render failed: %s", type(error).__name__)
            raise CvRenderUnavailableError(
                "The PDF could not be prepared right now. Please try again in a moment."
            ) from error

    async def _shutdown(self) -> None:
        await self._discard_browser(stop_driver=True)

    # -- public API (any thread) -------------------------------------------

    def print_pdf(self, html: str) -> bytes:
        """Blocking: print ``html`` (self-contained, with its own ``@page``) to PDF bytes."""
        return self._submit(self._print_with_timeout(html)).result()

    async def print_pdf_async(self, html: str) -> bytes:
        return await asyncio.wrap_future(self._submit(self._print_with_timeout(html)))

    def inspect_page(self, html: str, script: str):
        """Blocking: load ``html`` as the renderer does and return the JSON of ``script``
        evaluated in the page. Used by the build-time font audit, not by requests."""
        return self._submit(self._inspect_once(html, script)).result()

    def status(self) -> str:
        """``ready`` (running), ``idle`` (installed, not started yet) or ``unavailable``."""
        browser = self._browser
        if browser is not None and browser.is_connected():
            return "ready"
        if self._launch_failed or not chromium_installed():
            return "unavailable"
        return "idle"

    def shutdown(self) -> None:
        loop, thread = self._loop, self._thread
        if loop is None or thread is None or not thread.is_alive():
            return
        with contextlib.suppress(Exception):
            asyncio.run_coroutine_threadsafe(self._shutdown(), loop).result(10)
        loop.call_soon_threadsafe(loop.stop)
        thread.join(5)
        self._loop = self._thread = None


_pool = ChromiumPool()


def print_pdf(html: str) -> bytes:
    return _pool.print_pdf(html)


def inspect_page(html: str, script: str):
    return _pool.inspect_page(html, script)


async def print_pdf_async(html: str) -> bytes:
    return await _pool.print_pdf_async(html)


def chromium_status() -> str:
    return _pool.status()


def shutdown_chromium() -> None:
    _pool.shutdown()
