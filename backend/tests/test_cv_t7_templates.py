"""The T7/T8 templates (#467, #468): `scholar` and `frame` (ATS-safe, one column) and `slate`
(colourful band, less ATS-safe), printed by headless Chromium.

Per template and fixture: page counts, fonts (no Type 3, only the template's families),
Cyrillic and accents extract, ATS-safe templates extract in section order, colours on every
coloured fill read at 4.5:1 for every palette accent, and page-one golden images.
Regenerate the goldens deliberately with ``CV_UPDATE_GOLDEN=1 pytest tests/test_cv_t7_templates.py -k golden``.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import fitz
import pytest
from PIL import Image, ImageChops

from app.schemas.cv_documents import CV_ACCENT_PALETTE, CvStyle
from app.services.cv_html import TEMPLATES_DIR, load_manifest, render_cv_html
from app.services.cv_pdf import embedded_fonts, font_problems
from app.services.cv_rendering import build_render_model, render_pdf, validate_artifact
from app.services.cv_style_tokens import INK, WHITE, contrast_ratio, on_accent
from tests import cv_fixtures

GOLDEN_DIR = Path(__file__).parent / "golden" / "cv"
TEMPLATES = ("scholar", "frame", "slate")
SAFE = ("scholar", "frame")
FIXTURES = {**cv_fixtures.ALL, **cv_fixtures.EDGE}
PAGES = {
    "maya": 1, "long": 2, "accented": 1, "cyrillic": 1, "long_name": 1,
    "no_summary": 1, "name_only": 1, "edge_entries": 2,
}
# Frame's name card and contact band are taller: the long-name fixture runs just over a page.
PAGES_BY_TEMPLATE = {("frame", "long_name"): 2}
PDF_PREFIX = {"scholar": {"SourceSerif4"}, "frame": {"Ubuntu"}, "slate": {"FiraSans"}}


def _model(template: str, name: str, **style):
    return build_render_model(FIXTURES[name](), template, CvStyle(**style))


def _text(pdf: bytes) -> str:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        return "\n".join(page.get_text() for page in document)


@pytest.fixture(scope="module")
def pdfs():
    return {(t, n): render_pdf(_model(t, n)) for t in TEMPLATES for n in FIXTURES}


# -- pages, fonts, text -------------------------------------------------------------------


@pytest.mark.parametrize("name", list(FIXTURES))
@pytest.mark.parametrize("template", TEMPLATES)
def test_page_counts_and_fonts(pdfs, template, name):
    pdf = pdfs[(template, name)]
    with fitz.open(stream=pdf, filetype="pdf") as document:
        assert document.page_count == PAGES_BY_TEMPLATE.get((template, name), PAGES[name])
    fonts = embedded_fonts(pdf)
    assert fonts and all(font.embedded and font.type != "Type3" for font in fonts), fonts
    assert font_problems(pdf, load_manifest(template).families) == []
    assert {font.name.split("-")[0] for font in fonts} <= PDF_PREFIX[template]


@pytest.mark.parametrize("name", list(FIXTURES))
@pytest.mark.parametrize("template", TEMPLATES)
def test_read_back(pdfs, template, name):
    evidence = validate_artifact(_model(template, name), pdfs[(template, name)])
    assert (evidence.links, evidence.page_breaks) == ("pass", "pass")
    assert evidence.font_problems == []
    if template in SAFE:
        assert evidence.reads_back == "pass", evidence.unread_sections
    else:
        # Slate draws its lists beside the summary: every section reads back whole, in the
        # visual order (the "less ATS-safe" label and the quality advice cover this).
        assert evidence.reads_back == "pass" or evidence.order_only, evidence.unread_sections


@pytest.mark.parametrize("name", ["maya", "long", "cyrillic", "edge_entries"])
@pytest.mark.parametrize("template", SAFE)
def test_ats_safe_templates_extract_in_section_order(pdfs, template, name):
    model = _model(template, name)
    lines = [line.strip() for line in _text(pdfs[(template, name)]).splitlines()]
    positions = [lines.index(section.title) for section in model.sections]
    assert positions == sorted(positions)
    assert lines[0] == model.header.title.split()[0] or lines[0].startswith(model.header.title[:10])


@pytest.mark.parametrize("template", TEMPLATES)
def test_cyrillic_and_accents_extract_intact(pdfs, template):
    cyrillic, accented = _text(pdfs[(template, "cyrillic")]), _text(pdfs[(template, "accented")])
    assert "Анастасия Ковальчук-Фёдорова" in cyrillic
    assert "Київський національний університет" in cyrillic
    assert "Опыт" in cyrillic.splitlines()  # the user's own heading, not an uppercase copy
    assert "Zoë Åström-Nuñez" in accented and "ąćęłńóśźż" in accented


@pytest.mark.parametrize("template", TEMPLATES)
def test_section_headings_are_the_users_own_text(pdfs, template):
    lines = _text(pdfs[(template, "maya")]).splitlines()
    assert {"Summary", "Experience", "Education", "Skills", "Languages"} <= set(lines)
    assert "EXPERIENCE" not in lines
    css = (TEMPLATES_DIR / template / "template.css").read_text()
    assert not re.search(r"text-transform\s*:", css)


@pytest.mark.parametrize("template", TEMPLATES)
def test_a_cv_with_only_a_name_prints_just_the_name(pdfs, template):
    with fitz.open(stream=pdfs[(template, "name_only")], filetype="pdf") as document:
        assert document[0].get_text().split() == ["Maya", "Lindqvist"]


@pytest.mark.parametrize("template", TEMPLATES)
def test_an_empty_section_never_prints(template):
    cv = cv_fixtures.maya()
    cv.sections.append(cv_fixtures.section("z", "custom", "Volunteering", 9, []))
    pdf = render_pdf(build_render_model(cv, template, CvStyle()))
    assert "Volunteering" not in _text(pdf)


@pytest.mark.parametrize("template", TEMPLATES)
def test_entry_reading_order_is_role_organisation_dates_location(pdfs, template):
    text = _text(pdfs[(template, "maya")])
    assert text.index("Frontend Engineer\n") < text.index("Tulip Pay") < text.index("Mar 2022") < text.index("Amsterdam\n")


def test_frame_puts_the_contact_band_right_after_the_name_and_headline(pdfs):
    model = _model("frame", "maya")
    lines = [line for line in _text(pdfs[("frame", "maya")]).splitlines() if line.strip()]
    assert lines[:2] == [model.header.title, model.header.headline]
    assert lines[2 : 2 + len(model.header.contact)] == [
        model.header.location, model.header.email, model.header.phone, *model.header.links]
    assert lines[2 + len(model.header.contact)] == "Summary"


def test_frame_and_slate_print_list_like_skills_as_separate_items(pdfs):
    for template in ("frame", "slate"):
        text = _text(pdfs[(template, "maya")])
        assert "TypeScript • JavaScript" not in text  # chips or grid cells, not the raw line
        assert all(skill in text for skill in ("TypeScript", "Node.js", "CI/CD"))
        assert "English (fluent)" in text


def test_prose_in_a_skills_section_stays_a_paragraph():
    cv = cv_fixtures.maya()
    cv.sections[4]["entries"][0]["body"] = "Languages: TypeScript, Go. Tools: Docker, Terraform."
    for template in ("frame", "slate"):
        html = render_cv_html(build_render_model(cv, template, CvStyle()))
        assert "Languages: TypeScript, Go. Tools: Docker, Terraform." in html


def test_slate_draws_lists_beside_the_summary_and_the_rest_full_width(pdfs):
    with fitz.open(stream=pdfs[("slate", "long")], filetype="pdf") as document:
        page = document[0]
        words = page.get_text("words")
        x_of = {w[4]: w[0] for w in words}
        assert x_of["Skills"] > page.rect.width / 2 > x_of["Summary"]
        # Experience bullets run the full width (no narrow column on page two either).
        right = max(w[2] for w in document[1].get_text("words"))
        assert right > page.rect.width * 0.8


@pytest.mark.parametrize("template", TEMPLATES)
@pytest.mark.parametrize("density", ["compact", "normal", "spacious"])
def test_densities_and_letter_print_cleanly(template, density):
    pdf = render_pdf(_model(template, "long", density=density, page_size="letter"))
    with fitz.open(stream=pdf, filetype="pdf") as document:
        assert round(document[0].rect.width) == 612
        assert 1 <= document.page_count <= 3
    assert font_problems(pdf, load_manifest(template).families) == []


@pytest.mark.parametrize("template", TEMPLATES)
def test_long_name_stays_inside_the_page(pdfs, template):
    with fitz.open(stream=pdfs[(template, "long_name")], filetype="pdf") as document:
        page = document[0]
        assert max(block[2] for block in page.get_text("blocks")) <= page.rect.width - 10 * 72 / 25.4


# -- colour ---------------------------------------------------------------------------


def _mix(first: str, share: float, second: str) -> str:
    """CSS color-mix(in srgb, first share, second): per-channel interpolation."""
    a = [int(first[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(second[i : i + 2], 16) for i in (1, 3, 5)]
    return "#{:02X}{:02X}{:02X}".format(*(round(x * share + y * (1 - share)) for x, y in zip(a, b)))


def _mixes(template: str) -> dict[str, tuple[float, str]]:
    css = (TEMPLATES_DIR / template / "template.css").read_text()
    found = re.findall(r"--([\w-]+):\s*color-mix\(in srgb, var\(--accent\) (\d+)%, (#[0-9a-fA-F]{6})\)", css)
    return {name: (int(share) / 100, colour) for name, share, colour in found}


def _accents(template: str):
    """Every palette colour, plus the template's own default accent."""
    default = load_manifest(template).default_accent
    return sorted(set(CV_ACCENT_PALETTE) | ({default} if default else set()))


@pytest.mark.parametrize("accent", _accents("frame"))
def test_frame_band_reads_for_every_accent(accent):
    mixes = _mixes("frame")
    band = _mix(accent, *mixes["frame-band"])
    mark = _mix(accent, *mixes["frame-band-mark"])
    assert contrast_ratio(band, on_accent(accent)) >= 4.5, (accent, band)
    assert contrast_ratio(band, mark) >= 3, (accent, band, mark)  # a shape, not text
    assert contrast_ratio(accent, WHITE) >= 4.5  # headline, dates and bullets on white


@pytest.mark.parametrize("accent", _accents("slate"))
def test_slate_band_strip_headline_and_chips_read_for_every_accent(accent):
    mixes = _mixes("slate")
    band = _mix(accent, *mixes["slate-band"])
    strip = _mix(band, 0.78, "#000000")
    light = _mix(accent, *mixes["slate-light"])
    text = on_accent(accent)
    assert contrast_ratio(band, text) >= 4.5, (accent, band)    # name, filled chips
    assert contrast_ratio(strip, text) >= 4.5, (accent, strip)  # contact details
    assert contrast_ratio(band, light) >= 4.5, (accent, light)  # headline on the band
    assert contrast_ratio(strip, light) >= 3                     # contact markers (shapes)
    panel = _mix(accent, *mixes["slate-panel"])
    assert contrast_ratio(panel, INK) >= 12 and contrast_ratio(panel, accent) >= 4.5  # side panel
    assert contrast_ratio(panel, band) >= 4.5  # filled chips on the panel


def test_slate_strip_formula_matches_the_test():
    assert "color-mix(in srgb, var(--slate-band) 78%, #000000)" in (TEMPLATES_DIR / "slate" / "template.css").read_text()


@pytest.mark.parametrize("template", TEMPLATES)
def test_every_text_grey_reads_at_4_5_to_1_on_white(template):
    css = (TEMPLATES_DIR / template / "template.css").read_text()
    greys = re.findall(r"--[\w-]+-(?:ink-2|muted):\s*(#[0-9a-fA-F]{6})", css)
    assert greys
    for colour in greys:
        assert contrast_ratio(colour, WHITE) >= 4.5, colour


def test_slate_keeps_its_own_colour_until_another_accent_is_picked():
    html = render_cv_html(_model("slate", "maya"))
    assert "--accent: #0F766E" in html
    assert "--accent: #B91C1C" in render_cv_html(_model("slate", "maya", accent_color="#B91C1C"))


def test_manifests_match_the_spec():
    for template in TEMPLATES:
        manifest = load_manifest(template)
        assert manifest.photo_slot is False
        assert manifest.ats_safe is (template in SAFE)
        assert manifest.group == ("ats-safe" if template in SAFE else "more")
        assert manifest.columns == (1 if template in SAFE else 2)


# -- golden images ------------------------------------------------------------------------


def _raster(pdf: bytes) -> Image.Image:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pixmap = document[0].get_pixmap(dpi=80, colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


@pytest.mark.parametrize("name", list(cv_fixtures.ALL))
@pytest.mark.parametrize("template", TEMPLATES)
def test_golden_image_of_page_one(pdfs, template, name):
    golden = GOLDEN_DIR / f"{template}-{name}.png"
    image = _raster(pdfs[(template, name)])
    if os.environ.get("CV_UPDATE_GOLDEN") == "1":
        GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
        image.save(golden, optimize=True)
    assert golden.exists(), f"missing golden image; run with CV_UPDATE_GOLDEN=1 ({golden})"
    expected = Image.open(golden).convert("RGB")
    assert image.size == expected.size
    difference = ImageChops.difference(image, expected).convert("L")
    changed = sum(1 for value in difference.getdata() if value > 48)
    assert changed / (image.size[0] * image.size[1]) < 0.002, f"{changed} pixels differ from {golden.name}"
