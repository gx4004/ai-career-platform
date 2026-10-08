"""Template gallery thumbnails: page 1 of the built-in sample CV in every available template.

Every tile shows the same full, English sample CV (``cv_sample``), so the templates compare like for
like and none looks half empty. Each thumbnail is the same Chromium print as the PDF
(``render_cv_html`` then ``print_pdf``) with the person's accent, typeface, spacing and page size;
ATS mode and fit to one page do not apply to the gallery.

One page, always: the full sample runs a little over a page, and the smallest trim
(``cv_sample.trimmed_sample``) that keeps the template on one page is found by a binary search of
prints. That trim depends on the layout only (template, typeface, spacing, page size), not on the
colour, and is cached.

Because the content is constant, the thumbnails themselves are cached in-process (an LRU of
``CACHE_SIZE`` entries keyed by template, accent, typeface, spacing, page size and
``SAMPLE_VERSION``): a second request is served without touching Chromium, and a phone that
changes colour gets cached tiles back at once.

Budget (owner, 2026-10-08, mobile first): about 8 KB of WebP a thumbnail and 80 KB for the gallery.
320 px wide, sharp at 2x in a tile of up to 160 CSS px (the kit caps tiles there): the page is drawn
at twice that, scaled down (smooth strokes) and softened a little; text this small cannot be read,
and the softening halves the size of a dense page.

Cost: the templates print one after another, so a gallery request holds at most one of the shared
Chromium slots and the live preview always has the other. The request shares one time budget; a
template that fails or runs out of time gets an error marker (not cached) and the rest are still
returned. Only an unavailable renderer fails the request (HTTP 503). Nothing is stored.
"""

from __future__ import annotations

import base64
import io
import logging
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass

import fitz
from PIL import Image, ImageFilter

from app.schemas.cv_documents import CvStyle
from app.services.cv_chromium import ChromiumUnavailableError, RenderCancelledError, print_pdf
from app.services.cv_html import available_template_ids, render_cv_html
from app.services.cv_rendering import build_render_model
from app.services.cv_sample import SAMPLE_VERSION, TRIM_ORDER, trimmed_sample

logger = logging.getLogger(__name__)

THUMBNAIL_WIDTH = 320
THUMBNAIL_SUPERSAMPLE = 2
THUMBNAIL_BLUR = 0.8
THUMBNAIL_QUALITY = 50
THUMBNAIL_MAX_BYTES = 8 * 1024
# Under the renderer's own 15s per-print limit, so a slow request ends with what it has.
THUMBNAIL_BUDGET_SECONDS = 12.0
CACHE_SIZE = 256

FAILED_MESSAGE = "This preview could not be drawn."
TIMEOUT_MESSAGE = "This preview took too long to draw."


@dataclass(frozen=True)
class Thumbnail:
    template_id: str
    data_url: str | None = None
    width: int = 0
    height: int = 0
    error: str | None = None


class _Lru:
    """A small thread-safe LRU (requests run on threadpool threads)."""

    def __init__(self, size: int) -> None:
        self.size = size
        self._items: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key not in self._items:
                return None
            self._items.move_to_end(key)
            return self._items[key]

    def put(self, key, value) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self.size:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def __len__(self) -> int:
        return len(self._items)


_thumbnails = _Lru(CACHE_SIZE)
_trims = _Lru(CACHE_SIZE)


def clear_caches() -> None:
    _thumbnails.clear()
    _trims.clear()


def gallery_style(style: CvStyle, template_id: str) -> CvStyle:
    """The style a tile is drawn with: the person's look in ``template_id``; never ATS mode or fit."""
    return style.model_copy(
        update={"template_id": template_id, "ats_mode": False, "fit_one_page": False}
    )


def _print(template_id: str, style: CvStyle, drop: int, timeout: float) -> bytes:
    model = build_render_model(trimmed_sample(drop), template_id, style)
    return print_pdf(render_cv_html(model, page_size=style.page_size), timeout=timeout)


def _pages(pdf: bytes) -> int:
    with fitz.open(stream=pdf, filetype="pdf") as printed:
        return len(printed)


def sample_trim(
    template_id: str, style: CvStyle, remaining: Callable[[], float] = lambda: 15.0
) -> tuple[int, bytes]:
    """The smallest trim that keeps the sample on one page, and the PDF printed at it."""
    key = (template_id, style.font_id, style.density, style.page_size, SAMPLE_VERSION)
    cached = _trims.get(key)
    if cached is not None:
        return cached, _print(template_id, style, cached, remaining())
    low, high = 0, len(TRIM_ORDER)
    best: tuple[int, bytes] | None = None
    while low <= high:
        middle = (low + high) // 2
        pdf = _print(template_id, style, middle, remaining())
        if _pages(pdf) == 1:
            best, high = (middle, pdf), middle - 1
        else:
            low = middle + 1
    if best is None:  # Even the shortest sample runs over: show its page 1.
        best = (len(TRIM_ORDER), _print(template_id, style, len(TRIM_ORDER), remaining()))
    _trims.put(key, best[0])
    return best


def _webp(image: Image.Image) -> bytes:
    """WebP within the byte budget: quality steps down for an unusually dense page."""
    data = b""
    for quality in (THUMBNAIL_QUALITY, 40, 30, 20):
        out = io.BytesIO()
        image.save(out, format="WEBP", quality=quality, method=6)
        data = out.getvalue()
        if len(data) <= THUMBNAIL_MAX_BYTES:
            break
    return data


def _raster(template_id: str, pdf: bytes) -> Thumbnail:
    with fitz.open(stream=pdf, filetype="pdf") as printed:
        page = printed[0]
        zoom = THUMBNAIL_WIDTH * THUMBNAIL_SUPERSAMPLE / page.rect.width
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    height = round(THUMBNAIL_WIDTH * image.height / image.width)
    image = image.resize((THUMBNAIL_WIDTH, height), Image.LANCZOS)
    image = image.filter(ImageFilter.GaussianBlur(THUMBNAIL_BLUR))
    encoded = base64.b64encode(_webp(image)).decode("ascii")
    return Thumbnail(
        template_id=template_id,
        data_url=f"data:image/webp;base64,{encoded}",
        width=THUMBNAIL_WIDTH,
        height=height,
    )


def _thumbnail_key(template_id: str, style: CvStyle) -> tuple:
    return (
        template_id,
        style.accent_color,
        style.font_id,
        style.density,
        style.page_size,
        SAMPLE_VERSION,
    )


def _render_one(template_id: str, style: CvStyle, remaining: Callable[[], float]) -> Thumbnail:
    key = _thumbnail_key(template_id, style)
    cached = _thumbnails.get(key)
    if cached is not None:
        return cached
    _drop, pdf = sample_trim(template_id, style, remaining)
    thumbnail = _raster(template_id, pdf)
    _thumbnails.put(key, thumbnail)
    return thumbnail


def render_thumbnails(
    style: CvStyle,
    *,
    budget: float = THUMBNAIL_BUDGET_SECONDS,
    template_ids: list[str] | None = None,
    hold: Callable[[], AbstractContextManager] | None = None,
) -> list[Thumbnail]:
    """Page 1 of the sample CV in every available template (or those of ``template_ids``), in
    catalog order. Raises ``ChromiumUnavailableError`` (HTTP 503) when the renderer cannot start.

    ``hold`` is entered around each tile that has to be drawn (not around cached ones): the
    caller's per-user render lane, so a gallery never holds it for longer than one template."""
    deadline = time.monotonic() + budget

    def remaining() -> float:
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError
        return left

    wanted = set(template_ids) if template_ids is not None else None
    thumbnails = []
    for template_id in available_template_ids():
        if wanted is not None and template_id not in wanted:
            continue
        tile_style = gallery_style(style, template_id)
        try:
            cached = _thumbnails.get(_thumbnail_key(template_id, tile_style))
            if cached is not None:
                thumbnails.append(cached)
                continue
            with hold() if hold is not None else nullcontext():
                thumbnails.append(_render_one(template_id, tile_style, remaining))
        except (ChromiumUnavailableError, RenderCancelledError):
            raise
        except TimeoutError:
            thumbnails.append(Thumbnail(template_id=template_id, error=TIMEOUT_MESSAGE))
        except Exception as error:
            logger.warning("cv thumbnail failed for %s: %s", template_id, type(error).__name__)
            thumbnails.append(Thumbnail(template_id=template_id, error=FAILED_MESSAGE))
    return thumbnails
