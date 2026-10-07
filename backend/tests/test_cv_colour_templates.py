"""CV T6 (#466): the colourful sidebar and rail templates `lagoon`, `lilac` and `rail`.

Every fixture renders with only the template's fonts (no Type 3), text extracts with each
section whole (sidebar templates read header, sidebar, then main; rail reads in written
order), the colour structure runs edge to edge on every page, and text on every fill keeps
4.5:1 under every palette accent. Regenerate the golden images deliberately with
``CV_UPDATE_GOLDEN=1 pytest tests/test_cv_colour_templates.py -k golden``.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import fitz
import pytest
from PIL import Image, ImageChops

from app.schemas.cv_documents import CV_ACCENT_PALETTE, CvStyle
from app.services import cv_chromium
from app.services.cv_fonts import OVERRIDE_FONT_IDS
from app.services.cv_html import effective_families, load_manifest, render_cv_html
from app.services.cv_pdf import embedded_fonts, font_problems
from app.services.cv_rendering import build_render_model, render_pdf, validate_artifact
from app.services.cv_style_tokens import accent_tokens, contrast_ratio
from tests import cv_fixtures

TEMPLATES = ("lagoon", "lilac", "rail")
SIDEBAR_TEMPLATES = ("lagoon", "lilac")
FIXTURES = {**cv_fixtures.ALL, **cv_fixtures.EDGE}
EXPECTED_PAGES = {
    "maya": 1, "long": 2, "accented": 1, "cyrillic": 1, "long_name": 1,
    "no_summary": 1, "name_only": 1, "edge_entries": 2,
}
GOLDEN_DIR = Path(__file__).parent / "golden" / "cv"


def _model(template: str, name: str, **style):
    return build_render_model(FIXTURES[name](), template, CvStyle(**style))


def _text(pdf: bytes) -> str:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        return "\n".join(page.get_text() for page in document)


@pytest.fixture(scope="module")
def pdfs():
    return {(t, n): render_pdf(_model(t, n)) for t in TEMPLATES for n in FIXTURES}


# -- manifests --------------------------------------------------------------------------------


@pytest.mark.parametrize("template", TEMPLATES)
def test_manifest_marks_a_less_ats_safe_two_column_template_with_a_photo_slot(template):
    manifest = load_manifest(template)
    assert (manifest.ats_safe, manifest.group, manifest.columns, manifest.photo_slot) == (False, "more", 2, True)
    assert manifest.default_accent is None or manifest.default_accent in CV_ACCENT_PALETTE


# -- every fixture ------------------------------------------------------------------------------


@pytest.mark.parametrize("name", list(FIXTURES))
@pytest.mark.parametrize("template", TEMPLATES)
def test_every_fixture_prints_with_the_expected_pages_and_only_the_templates_fonts(pdfs, template, name):
    pdf = pdfs[(template, name)]
    with fitz.open(stream=pdf, filetype="pdf") as document:
        assert document.page_count == EXPECTED_PAGES[name]
    fonts = embedded_fonts(pdf)
    assert fonts and all(font.embedded and font.type != "Type3" for font in fonts)
    assert font_problems(pdf, effective_families(template)) == []


@pytest.mark.parametrize("name", list(FIXTURES))
@pytest.mark.parametrize("template", TEMPLATES)
def test_every_section_reads_back_whole(pdfs, template, name):
    """Rail reads in the written order. A sidebar template reads header, sidebar sections,
    then main sections: the order may differ from the written one, but each section's text
    comes back whole (order_only), never interleaved with another's."""
    model = _model(template, name)
    evidence = validate_artifact(model, pdfs[(template, name)])
    assert (evidence.links, evidence.page_breaks) == ("pass", "pass")
    if template == "rail":
        assert evidence.reads_back == "pass", evidence.unread_sections
    else:
        assert evidence.reads_back == "pass" or evidence.order_only, evidence.unread_sections


@pytest.mark.parametrize("template", SIDEBAR_TEMPLATES)
def test_sidebar_templates_read_header_then_sidebar_then_main_in_written_order(pdfs, template):
    model = _model(template, "long")
    lines = [line.strip() for line in _text(pdfs[(template, "long")]).splitlines()]
    side_kinds = set(load_manifest(template).sidebar_kinds)
    side = [s.title for s in model.sections if s.kind in side_kinds]
    main = [s.title for s in model.sections if s.kind not in side_kinds]
    assert side == ["Education", "Skills", "Languages"]
    positions = [lines.index(title) for title in side + main]
    assert positions == sorted(positions)
    assert lines.index("Maya Lindqvist") < positions[0]
    # The monogram follows the contact lines and precedes every section.
    github = next(i for i, line in enumerate(lines) if line.startswith("github.com/"))
    assert github < lines.index("ML") < positions[0]


def test_rail_reads_label_then_content_in_written_order(pdfs):
    model = _model("rail", "long")
    lines = [line.strip() for line in _text(pdfs[("rail", "long")]).splitlines()]
    positions = [lines.index(section.title) for section in model.sections]
    assert positions == sorted(positions)


def test_cyrillic_and_accented_text_extracts_intact(pdfs):
    for template in TEMPLATES:
        cyrillic, accented = _text(pdfs[(template, "cyrillic")]), _text(pdfs[(template, "accented")])
        cyrillic = " ".join(cyrillic.split()).replace("- ", "-")
        accented = " ".join(accented.split()).replace("- ", "-")
        assert "Анастасия Ковальчук-Фёдорова" in cyrillic, template
        assert "Київський національний" in cyrillic, template
        assert "Zoë Åström-Nuñez" in accented and "ąćęłńóśźż" in accented, template


@pytest.mark.parametrize("template", TEMPLATES)
def test_a_name_only_cv_prints_the_name_and_its_monogram(pdfs, template):
    assert _text(pdfs[(template, "name_only")]).split() == ["Maya", "Lindqvist", "ML"]
    html = render_cv_html(_model(template, "name_only"))
    assert "<h2>" not in html


@pytest.mark.parametrize("template", TEMPLATES)
def test_an_empty_section_never_prints(template):
    cv = cv_fixtures.maya()
    cv.sections.append(cv_fixtures.section("v", "custom", "Volunteering", 6, []))
    pdf = render_pdf(build_render_model(cv, template, CvStyle()))
    assert "Volunteering" not in _text(pdf)


@pytest.mark.parametrize("template", TEMPLATES)
def test_skills_print_as_plain_items_without_ratings(pdfs, template):
    text = _text(pdfs[(template, "maya")])
    for skill in ("TypeScript", "Playwright", "CI/CD"):
        assert skill in text
    assert not re.search(r"[★☆●○◼◻]", text)


def test_a_long_custom_section_stays_in_the_main_column():
    cv = cv_fixtures.maya()
    cv.sections.append(cv_fixtures.section("v", "custom", "Volunteering", 6, [
        cv_fixtures.entry("v1", 0, heading="Mentor", subheading="Code Club", bullets=["Taught kids."])]))
    html = render_cv_html(build_render_model(cv, "lagoon", CvStyle()))
    aside, main = html.split('<aside class="lg-side">')[1].split('<main class="lg-main">')
    assert "Languages" in aside and "Volunteering" not in aside and "Volunteering" in main


# -- colour structure ---------------------------------------------------------------------------


def _pixel(pdf: bytes, page: int, x_mm: float, y_mm: float) -> tuple[int, int, int]:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pixmap = document[page].get_pixmap(dpi=40, colorspace=fitz.csRGB, alpha=False)
        scale = 40 / 25.4
        return pixmap.pixel(round(x_mm * scale), min(pixmap.height - 1, round(y_mm * scale)))


def _rgb(hex_colour: str) -> tuple[int, int, int]:
    return tuple(int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))


@pytest.mark.parametrize("template", TEMPLATES)
def test_the_strip_runs_edge_to_edge_on_every_page(pdfs, template):
    pdf = pdfs[(template, "long")]
    accent = load_manifest(template).default_accent or "#111827"
    with fitz.open(stream=pdf, filetype="pdf") as document:
        height_mm = document[0].rect.height / 72 * 25.4
    for page in (0, 1):
        for y in (0.5, height_mm / 2, height_mm - 1.5):
            colour = _pixel(pdf, page, 1.5, y)
            if template == "lilac":  # the tinted column; page 1 opens with the deep name panel
                if page == 0 and y < 1:
                    assert colour == _rgb("#6D28D9"), colour
                    continue
                assert colour != (255, 255, 255) and min(colour) > 180, (page, y, colour)
            else:
                assert max(abs(a - b) for a, b in zip(colour, _rgb(accent))) <= 6, (page, y, colour)


@pytest.mark.parametrize("template", TEMPLATES)
def test_the_accent_drives_the_fill_and_ink_keeps_the_templates_own_colour(template):
    default = load_manifest(template).default_accent
    html = render_cv_html(_model(template, "maya"))
    assert f"--accent: {default or '#111827'};" in html
    plum = render_cv_html(_model(template, "maya", accent_color="#9D174D"))
    assert "--accent: #9D174D;" in plum


_CONTRAST_AUDIT = """
(() => {
  const parse = (value) => {
    let m = value.match(/^rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = value.match(/^color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.]+))?\\)$/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const background = (el) => {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour[3] > 0) return colour;
    }
    return [255, 255, 255, 1];
  };
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    out.push({text: el.textContent.trim().slice(0, 30), fg: parse(getComputedStyle(el).color), bg: background(el)});
  }
  return out;
})()
"""


def _hex(rgb) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(round(c) for c in rgb[:3]))


@pytest.mark.parametrize("accent", CV_ACCENT_PALETTE)
@pytest.mark.parametrize("template", TEMPLATES)
def test_every_text_on_every_fill_reads_at_4_5_to_1_for_every_palette_accent(template, accent):
    html = render_cv_html(_model(template, "maya", accent_color=accent))
    audit = cv_chromium.inspect_page(html, _CONTRAST_AUDIT)
    assert len(audit) > 20
    for item in audit:
        assert item["fg"] and item["fg"][3] == 1, item
        ratio = contrast_ratio(_hex(item["fg"]), _hex(item["bg"]))
        assert ratio >= 4.5, (template, accent, item["text"], _hex(item["fg"]), _hex(item["bg"]), round(ratio, 2))
    # The fill text really is the token the accent maths picked.
    assert accent_tokens(accent)["on_accent"] in html


# -- styles -------------------------------------------------------------------------------------


@pytest.mark.parametrize("font_id", OVERRIDE_FONT_IDS)
@pytest.mark.parametrize("template", TEMPLATES)
def test_each_typeface_override_prints_only_its_families(template, font_id):
    pdf = render_pdf(_model(template, "accented", font_id=font_id))
    assert font_problems(pdf, effective_families(template, font_id)) == []


@pytest.mark.parametrize("template", TEMPLATES)
def test_densities_and_letter_keep_the_long_cv_within_three_pages(template):
    counts = {}
    for density in ("compact", "normal", "spacious"):
        pdf = render_pdf(_model(template, "long", density=density, page_size="letter"))
        with fitz.open(stream=pdf, filetype="pdf") as document:
            counts[density] = document.page_count
            assert round(document[0].rect.width) == 612
    assert counts["compact"] <= counts["normal"] <= counts["spacious"] <= 3


# -- golden images ------------------------------------------------------------------------------


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
    pixels = image.size[0] * image.size[1]
    changed = sum(1 for value in difference.getdata() if value > 48)
    assert changed / pixels < 0.002, f"{changed} of {pixels} pixels differ from {golden.name}"
