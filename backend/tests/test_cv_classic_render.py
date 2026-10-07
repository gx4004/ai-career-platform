"""The `classic` HTML template printed by headless Chromium (T1, #460).

Covers the five fixtures of spec section 5 (short, long, accented, Cyrillic, long
name), fonts, golden images, the 503 path, the render slots and crash recovery.
Regenerate the golden images deliberately with ``CV_UPDATE_GOLDEN=1 pytest
tests/test_cv_classic_render.py -k golden``.
"""

from __future__ import annotations

import asyncio
import os
import threading
import time
import unicodedata
from pathlib import Path

import fitz
import pytest
from PIL import Image, ImageChops

from app.schemas.cv_documents import CvStyle
from app.services import cv_chromium
from app.services.cv_chromium import (
    ChromiumPool,
    ChromiumUnavailableError,
    CvRenderUnavailableError,
    RenderTimeoutError,
)
from app.services.cv_html import (
    html_template_id,
    load_manifest,
    missing_characters,
    render_cv_html,
)
from app.services.cv_pdf import EmbeddedFont, embedded_fonts, font_problems, normalize_pdf
from app.services.cv_rendering import build_render_model, render_pdf, validate_artifact
from app.schemas.cv_documents import LEGACY_CV_TEMPLATE_IDS
from tests import cv_fixtures

GOLDEN_DIR = Path(__file__).parent / "golden" / "cv"
EXPECTED_PAGES = {"maya": 1, "long": 2, "accented": 1, "cyrillic": 1, "long_name": 1}
FAMILIES = load_manifest("classic").families


def _model(name: str, template: str = "classic"):
    return build_render_model(cv_fixtures.ALL[name](), template, CvStyle())


def _text(pdf: bytes) -> str:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        return "\n".join(page.get_text() for page in document)


@pytest.fixture(scope="module")
def pdfs():
    return {name: render_pdf(_model(name)) for name in cv_fixtures.ALL}


# -- content ------------------------------------------------------------------


@pytest.mark.parametrize("name", list(cv_fixtures.ALL))
def test_classic_renders_every_fixture_with_the_expected_page_count(pdfs, name):
    with fitz.open(stream=pdfs[name], filetype="pdf") as document:
        assert document.page_count == EXPECTED_PAGES[name]
        assert document[0].rect.width == pytest.approx(595.28, abs=0.5)  # A4 from the template


@pytest.mark.parametrize("name", list(cv_fixtures.ALL))
def test_the_read_back_passes_on_every_fixture(pdfs, name):
    evidence = validate_artifact(_model(name), pdfs[name])
    assert (evidence.reads_back, evidence.links, evidence.page_breaks) == ("pass",) * 3
    assert evidence.font_problems == []


def test_fonts_are_embedded_and_only_the_templates_with_no_type_3(pdfs):
    for name, pdf in pdfs.items():
        fonts = embedded_fonts(pdf)
        assert fonts, name
        assert all(font.embedded and font.type != "Type3" for font in fonts), (name, fonts)
        assert font_problems(pdf, FAMILIES) == [], name
        assert {font.name.split("-")[0] for font in fonts} <= {"SourceSans3", "SourceSerif4"}


def test_cyrillic_and_accented_text_extracts_intact(pdfs):
    cyrillic, accented = _text(pdfs["cyrillic"]), _text(pdfs["accented"])
    assert "Анастасия Ковальчук-Фёдорова" in cyrillic
    assert "Київський національний університет" in cyrillic
    assert "Zoë Åström-Nuñez" in accented
    assert "ąćęłńóśźż" in accented


def test_long_name_wraps_instead_of_overflowing(pdfs):
    with fitz.open(stream=pdfs["long_name"], filetype="pdf") as document:
        page = document[0]
        right_edge = page.rect.width - 17 * 72 / 25.4
        assert max(block[2] for block in page.get_text("blocks")) <= right_edge + 1


def test_entries_do_not_split_across_pages_unless_long(pdfs):
    """The long fixture's later jobs are long enough to split; its short project entries are not."""
    with fitz.open(stream=pdfs["long"], filetype="pdf") as document:
        pages = [page.get_text() for page in document]
    for number in (1, 2, 3):
        assert sum(f"Open source project {number}" in page for page in pages) == 1


def test_body_text_is_a_bullet_character_and_links_are_real(pdfs):
    text = _text(pdfs["maya"])
    assert text.count("•") >= 8  # list bullets are text, so an ATS can see them
    with fitz.open(stream=pdfs["long"], filetype="pdf") as document:
        uris = {link.get("uri") for page in document for link in page.get_links()}
    assert {"https://example.com/p1", "mailto:maya.lindqvist@example.com"} <= uris
    assert "https://github.com/maya-lindqvist-example" in uris


def test_the_two_prints_of_one_cv_are_byte_identical():
    model = _model("maya")
    first = render_pdf(model)
    time.sleep(1.1)  # Chromium stamps whole seconds
    assert render_pdf(model) == first


def test_pdf_normalisation_only_fixes_the_dates():
    raw = b"<< /CreationDate (D:20261007154443+00'00') /ModDate (D:20261007154444+00'00') >>"
    fixed = normalize_pdf(raw)
    assert len(fixed) == len(raw)
    assert b"D:20000101000000" in fixed and b"2026" not in fixed


@pytest.mark.parametrize("template_id", sorted(set(LEGACY_CV_TEMPLATE_IDS.values()) | {"scholar", "ledger"}))
def test_a_template_id_without_a_template_dir_prints_as_classic(template_id):
    # Ids of templates that have not landed yet (T6-T8) are valid and print as classic.
    assert html_template_id(template_id) == "classic"
    model = _model("maya", template_id)
    pdf = render_pdf(model)
    assert font_problems(pdf, FAMILIES) == []
    assert "Maya Lindqvist" in _text(pdf)


def test_glyphs_the_fonts_lack_are_reported_and_print_as_spaces():
    cv = cv_fixtures.maya()
    cv.sections[0]["entries"][0]["body"] = "Built APIs\U0001f600fast and 日本語 pages."
    model = build_render_model(cv, "classic", CvStyle())
    assert set(model.unsupported_characters) >= {"\U0001f600", "日"}
    pdf = render_pdf(model)
    assert font_problems(pdf, FAMILIES) == []  # no fallback face was embedded
    evidence = validate_artifact(model, pdf)
    assert evidence.reads_back == "fail" and evidence.page_breaks == "pass"
    assert "APIs fast" in " ".join(_text(pdf).split())


def test_text_is_nfc_normalised_and_the_header_is_structured():
    cv = cv_fixtures.maya()
    cv.header = {**cv.header, "name": "Zoë Nũnez"}
    model = build_render_model(cv, "classic", CvStyle())
    assert model.header.title == unicodedata.normalize("NFC", "Zoë Nũnez")
    assert len(model.header.title) == len("Zoë Nuñez")
    header = model.header
    assert (header.email, header.phone, header.location) == (
        "maya.lindqvist@example.com", "+31 6 1234 5678", "Amsterdam, Netherlands")
    assert header.links[0] == "linkedin.com/in/maya-lindqvist-example"
    # The flat contact list stays, in its old order, for DOCX and the checks.
    assert header.contact[:3] == [header.email, header.phone, header.location]


def test_html_is_self_contained():
    html = render_cv_html(_model("maya"))
    assert 'src: url("data:font/ttf;base64,' in html
    assert "http://" not in html.replace("https://", "").split("<body")[0]
    assert "@page { size: A4;" in html
    assert missing_characters("classic", "Zoë Ж ł") == []


# -- golden images --------------------------------------------------------------


def _raster(pdf: bytes) -> Image.Image:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pixmap = document[0].get_pixmap(dpi=80, colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


@pytest.mark.parametrize("name", list(cv_fixtures.ALL))
def test_golden_image_of_page_one(pdfs, name):
    golden = GOLDEN_DIR / f"classic-{name}.png"
    image = _raster(pdfs[name])
    if os.environ.get("CV_UPDATE_GOLDEN") == "1":
        GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
        image.save(golden, optimize=True)
    assert golden.exists(), f"missing golden image; run with CV_UPDATE_GOLDEN=1 ({golden})"
    expected = Image.open(golden).convert("RGB")
    assert image.size == expected.size
    difference = ImageChops.difference(image, expected).convert("L")
    pixels = image.size[0] * image.size[1]
    changed = sum(1 for value in difference.getdata() if value > 48)
    # A different layout moves many pixels; anti-aliasing noise moves almost none.
    assert changed / pixels < 0.002, f"{changed} of {pixels} pixels differ from {golden.name}"


# -- the 503 path ---------------------------------------------------------------


def test_missing_chromium_is_a_503_with_a_plain_sentence(client, auth_headers, monkeypatch):
    def unavailable(self):
        raise ChromiumUnavailableError()

    monkeypatch.setattr(ChromiumPool, "_get_browser", unavailable)
    created = client.post(
        "/api/v1/cv-documents",
        json={"name": "CV", "sections": [cv_fixtures.section("s", "summary", "Summary", 0, [
            cv_fixtures.entry("e", 0, body="Engineer.")])]},
        headers=auth_headers,
    )
    document_id = created.json()["id"]

    pdf = client.get(f"/api/v1/cv-documents/{document_id}/artifacts/pdf", headers=auth_headers)
    assert pdf.status_code == 503
    assert pdf.json()["detail"] == ChromiumUnavailableError.message
    assert pdf.json()["detail"].endswith(".") and "Traceback" not in pdf.text
    quality = client.post(f"/api/v1/cv-documents/{document_id}/quality", headers=auth_headers)
    assert quality.status_code == 503
    # DOCX does not need Chromium.
    docx = client.get(f"/api/v1/cv-documents/{document_id}/artifacts/docx", headers=auth_headers)
    assert docx.status_code == 200


def test_a_failed_launch_is_unavailable_and_never_a_raw_error(monkeypatch):
    class Broken:
        async def start(self):
            raise RuntimeError("Executable doesn't exist at /nowhere")

    import playwright.async_api as playwright_api

    monkeypatch.setattr(playwright_api, "async_playwright", lambda: Broken())
    pool = ChromiumPool()
    try:
        with pytest.raises(ChromiumUnavailableError) as raised:
            pool.print_pdf("<p>x</p>")
        assert "nowhere" not in raised.value.message
        assert pool.status() == "unavailable"
    finally:
        pool.shutdown()


def test_health_reports_chromium_without_failing_the_probe(client, monkeypatch):
    monkeypatch.setattr("app.routers.health.chromium_status", lambda: "unavailable")
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["checks"] == {"database": "ok", "chromium": "unavailable"}


def test_health_does_not_start_the_browser():
    pool = ChromiumPool()
    assert pool.status() in {"idle", "unavailable"}
    assert pool._loop is None and pool.launches == 0


# -- slots, timeout, crash recovery ----------------------------------------------


def test_at_most_two_renders_print_at_once(monkeypatch):
    pool = ChromiumPool(concurrency=2)
    running = peak = 0
    guard = threading.Lock()

    async def fake_print(self, html, prepare_script=None):
        nonlocal running, peak
        with guard:
            running += 1
            peak = max(peak, running)
        await asyncio.sleep(0.15)
        with guard:
            running -= 1
        return b"%PDF"

    monkeypatch.setattr(ChromiumPool, "_print_once", fake_print)
    threads = [threading.Thread(target=pool.print_pdf, args=("<p>x</p>",)) for _ in range(6)]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(10)
        assert peak == 2
        assert pool.peak_in_flight == 2
    finally:
        pool.shutdown()


def test_the_module_default_is_two_slots_and_fifteen_seconds():
    assert cv_chromium.MAX_CONCURRENT_RENDERS == 2
    assert cv_chromium.RENDER_TIMEOUT_SECONDS == 15.0
    assert cv_chromium._pool.concurrency == 2 and cv_chromium._pool.timeout == 15.0


def test_a_render_that_takes_too_long_is_abandoned_with_a_503_error(monkeypatch):
    async def slow(self, html, prepare_script=None):
        await asyncio.sleep(5)

    monkeypatch.setattr(ChromiumPool, "_print_once", slow)
    pool = ChromiumPool(timeout=0.2)
    try:
        started = time.monotonic()
        with pytest.raises(RenderTimeoutError):
            pool.print_pdf("<p>x</p>")
        assert time.monotonic() - started < 2
        assert issubclass(RenderTimeoutError, CvRenderUnavailableError)
    finally:
        pool.shutdown()


def test_a_crashed_browser_is_restarted_on_the_next_render():
    pool = ChromiumPool()
    try:
        assert pool.print_pdf("<p>one</p>").startswith(b"%PDF")
        assert pool.status() == "ready" and pool.launches == 1
        asyncio.run_coroutine_threadsafe(pool._browser.close(), pool._loop).result(10)
        assert pool.status() in {"idle", "unavailable"}
        assert pool.print_pdf("<p>two</p>").startswith(b"%PDF")
        assert pool.launches == 2
    finally:
        pool.shutdown()


def test_nothing_is_fetched_from_the_network():
    pool = ChromiumPool()
    try:
        html = '<img src="https://example.invalid/x.png"><p>inline</p>'
        pdf = pool.print_pdf(html)
        assert "inline" in _text(pdf)
    finally:
        pool.shutdown()


# -- font checks ----------------------------------------------------------------


def test_font_problems_name_type_3_unembedded_and_foreign_fonts(monkeypatch):
    fonts = [
        EmbeddedFont("SourceSans3-Regular", "Type0", True),
        EmbeddedFont("SourceSerif4Variable", "Type3", True),
        EmbeddedFont("Helvetica", "Type1", False),
        EmbeddedFont("DejaVuSans", "Type0", True),
    ]
    monkeypatch.setattr("app.services.cv_pdf.embedded_fonts", lambda pdf: fonts)
    problems = font_problems(b"", FAMILIES)
    assert problems == [
        "SourceSerif4Variable is a Type 3 font",
        "Helvetica is not embedded",
        "DejaVuSans is not one of the template's fonts",
    ]
