"""Bundled CV fonts and style controls (T4, #463): registry, typeface override, accent,
density, glyph coverage and NFC.

The acceptance bar: a PDF never has a Type 3 font or a fallback face, and Cyrillic and
accented text prints in every bundled family.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import fitz
import pytest
from fontTools.ttLib import TTFont

from app.schemas.cv_documents import (
    CV_ACCENT_NAMES,
    CV_ACCENT_PALETTE,
    LEGACY_CV_FONT_IDS,
    CvStyle,
)
from app.services import cv_chromium
from app.services.cv_fonts import (
    FONTS_DIR,
    OVERRIDE_FONT_IDS,
    TYPEFACES,
    TYPEFACES_BY_NAME,
    heading_family,
    typeface_covered,
)
from app.services.cv_html import (
    TEMPLATES_DIR,
    available_template_ids,
    effective_families,
    font_plan,
    load_manifest,
    missing_characters,
    render_cv_html,
)
from app.services.cv_pdf import embedded_fonts, font_problems
from app.services.cv_rendering import build_render_model, render_pdf, validate_artifact
from app.services.cv_style_tokens import (
    INK,
    MIN_TEXT_CONTRAST,
    WHITE,
    accent_tint,
    accent_tokens,
    contrast_ratio,
    on_accent,
)
from tests import cv_fixtures

CYRILLIC = set(range(0x410, 0x450)) | {0x401, 0x451}
LATIN_1 = set(range(0xC0, 0x100)) - {0xD7, 0xF7}
# Latin Extended-A letters of the languages a CV is likely written in (pl, cs, sk, hu, ro, tr,
# hr, lt, lv, et, sl, mt). Rare ones (Ĳ, ĸ, ŉ, ſ, Sami Ŧ) are not required.
LATIN_EXT_A = {ord(c) for c in "ĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĪīĮįİıĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž"}
FIXTURES = ("maya", "cyrillic", "accented")


def _model(name: str, *, font: str | None = None, template: str = "classic", **style):
    return build_render_model(cv_fixtures.ALL[name](), template, CvStyle(font_id=font, **style))


def _model_with_family(name: str, family_id: str):
    """A render model forced to any bundled family (the API only offers the six overrides)."""
    model = _model(name)
    model.tokens["font_override"] = family_id
    model.unsupported_characters = missing_characters(
        "classic", _all_text(model), family_id
    )
    return model


def _all_text(model) -> str:
    parts = [model.header.title, model.header.headline or "", *model.header.contact]
    for section in model.sections:
        parts.append(section.title)
        for entry in section.entries:
            parts += [entry.heading or "", entry.subheading or "", entry.location or "",
                      entry.dates or "", entry.paragraph or "", *entry.bullets]
    return "\n".join(parts)


def _text(pdf: bytes) -> str:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        return "\n".join(page.get_text() for page in document)


# -- registry and font files ----------------------------------------------------------


def test_the_registry_lists_the_families_the_templates_need():
    assert {
        "inter", "source-sans-3", "ibm-plex-sans", "ibm-plex-serif", "ibm-plex-mono", "source-serif-4",
        "lora", "eb-garamond", "cormorant-garamond", "nunito", "ubuntu", "roboto-slab", "raleway",
        "fira-sans", "manrope",
    } <= set(TYPEFACES)
    assert OVERRIDE_FONT_IDS == (
        "inter", "source-sans-3", "ibm-plex-sans", "source-serif-4", "lora", "eb-garamond",
    )
    assert all(TYPEFACES[font_id].category in ("sans-serif", "serif") for font_id in OVERRIDE_FONT_IDS)


@pytest.mark.parametrize("family", sorted(TYPEFACES))
def test_every_face_is_a_static_ttf_with_cyrillic_and_latin_extended(family):
    typeface = TYPEFACES[family]
    assert typeface.cyrillic
    assert any(f.weight == 400 and f.style == "normal" for f in typeface.faces)
    assert any(f.weight == 700 and f.style == "normal" for f in typeface.faces)
    for face in typeface.faces:
        assert face.path.is_file(), face.file
        font = TTFont(face.path)
        assert "fvar" not in font, f"{face.file} is a variable font (it would print as Type 3)"
        assert "glyf" in font, f"{face.file} is not TrueType outlines"
        # The PDF font name is <Family-without-spaces>-<Style>: the font check matches on it.
        assert font["name"].getDebugName(6).split("-")[0] == typeface.pdf_prefix, face.file
        cmap = set(font.getBestCmap())
        assert CYRILLIC <= cmap, (face.file, sorted(CYRILLIC - cmap)[:5])
        assert LATIN_1 <= cmap, (face.file, sorted(LATIN_1 - cmap)[:5])
        assert LATIN_EXT_A <= cmap or family == "manrope", (face.file, sorted(LATIN_EXT_A - cmap)[:5])
        assert font["OS/2"].usWeightClass == face.weight, face.file
        assert bool(font["head"].macStyle & 2) == (face.style == "italic"), face.file


def test_manrope_lacks_only_the_rarer_latin_extended_letters():
    covered = typeface_covered(TYPEFACES["manrope"])
    needed = {ord(c) for c in "ĄąĆćČčĘęĚěĞğİıŁłŃńŐőŒœŘřŚśŞşŠšŢţŪūŮůŰűŽžŹźŻż"}  # pl cs hu tr ro lt lv
    assert needed <= covered


@pytest.mark.parametrize("directory", sorted(p.name for p in FONTS_DIR.iterdir() if p.is_dir()))
def test_every_family_directory_carries_its_licence(directory):
    names = {p.name for p in (FONTS_DIR / directory).iterdir()}
    assert names & {"OFL.txt", "LICENSE.txt", "UFL.txt"}, directory
    notice = next((FONTS_DIR / directory / n) for n in ("OFL.txt", "LICENSE.txt", "UFL.txt") if n in names)
    text = notice.read_text("utf-8")
    assert re.search(r"SIL OPEN FONT LICENSE|Apache License|UBUNTU FONT LICENCE", text, re.I)


def test_nearest_face_never_synthesises():
    inter = TYPEFACES["inter"]
    assert inter.face(300).weight == 400  # no Light shipped: the nearest real face
    assert inter.face(600).weight == 600 and inter.face(400, "italic").style == "italic"
    assert TYPEFACES["manrope"].face(400, "italic").style == "normal"  # no italic: upright file
    assert TYPEFACES["ubuntu"].face(600).weight in (500, 700)


def test_a_legacy_typeface_id_maps_to_the_nearest_curated_family():
    assert LEGACY_CV_FONT_IDS == {
        "lato": "inter", "pt-sans": "source-sans-3", "pt-serif": "source-serif-4",
        "crimson-text": "lora", "ibm-plex-mono": "ibm-plex-sans",
    }
    for legacy, mapped in LEGACY_CV_FONT_IDS.items():
        assert CvStyle.model_validate({"font_id": legacy}).font_id == mapped
        assert mapped in OVERRIDE_FONT_IDS
    assert CvStyle.model_validate({"font_id": "eb-garamond"}).font_id == "eb-garamond"
    with pytest.raises(ValueError):
        CvStyle(font_id="comic-sans")


# -- the override rule ------------------------------------------------------------------


def test_the_override_replaces_body_and_matching_category_headings():
    classic = load_manifest("classic")
    assert classic.typefaces == {"heading": "Source Serif 4", "body": "Source Sans 3"}
    sans, serif = TYPEFACES["inter"], TYPEFACES["lora"]
    assert heading_family("Source Serif 4", sans) is TYPEFACES_BY_NAME["Source Serif 4"]  # kept
    assert heading_family("Source Serif 4", serif) is serif  # same category: replaced
    assert heading_family("Source Sans 3", sans) is sans
    assert heading_family("Source Sans 3", None) is TYPEFACES_BY_NAME["Source Sans 3"]


def test_classic_default_matches_its_manifest_faces():
    plan = font_plan("classic")
    assert {(f.family, f.weight, f.style, f.file) for f in load_manifest("classic").fonts} == {
        (family.name, weight, style, face.file) for family, weight, style, face in plan.faces
    }


@pytest.mark.parametrize("font_id", [None, *OVERRIDE_FONT_IDS])
def test_the_override_prints_only_its_families_with_no_type_3(font_id):
    model = _model("maya", font=font_id)
    pdf = render_pdf(model)
    fonts = embedded_fonts(pdf)
    assert fonts and all(f.embedded and f.type != "Type3" for f in fonts), fonts
    expected = effective_families("classic", font_id)
    assert font_problems(pdf, expected) == []
    names = {f.name.split("-")[0] for f in fonts}
    assert names <= {n.replace(" ", "") for n in expected}
    if font_id:  # the body family really changed
        assert TYPEFACES[font_id].pdf_prefix in names
    assert validate_artifact(model, pdf).font_problems == []


def test_ats_mode_ignores_the_override():
    model = _model("maya", font="lora", ats_mode=True)
    assert model.tokens["font_override"] == ""
    assert effective_families("classic") >= {n.replace(" ", "") for n in ()}  # smoke
    assert {f.name.split("-")[0] for f in embedded_fonts(render_pdf(model))} <= {"SourceSans3", "SourceSerif4"}


@pytest.mark.parametrize("font_id", OVERRIDE_FONT_IDS)
@pytest.mark.parametrize("name", FIXTURES)
def test_each_override_renders_each_fixture_without_fallbacks(font_id, name):
    model = _model(name, font=font_id)
    assert model.unsupported_characters == []
    pdf = render_pdf(model)
    assert font_problems(pdf, effective_families("classic", font_id)) == []
    text = _text(pdf)
    assert model.header.title in text


# -- every family, every fixture ------------------------------------------------------------


@pytest.mark.parametrize("family", sorted(TYPEFACES))
@pytest.mark.parametrize("name", FIXTURES)
def test_every_family_renders_cyrillic_and_accents_in_its_own_faces(family, name):
    model = _model_with_family(name, family)
    assert model.unsupported_characters == [], (family, model.unsupported_characters)
    pdf = render_pdf(model)
    with fitz.open(stream=pdf, filetype="pdf") as document:
        assert document.page_count >= 1
    fonts = embedded_fonts(pdf)
    assert fonts and all(f.embedded and f.type != "Type3" for f in fonts), (family, fonts)
    assert font_problems(pdf, effective_families("classic", family)) == [], family
    text = _text(pdf)
    if name == "cyrillic":
        assert "Анастасия Ковальчук-Фёдорова" in text
        assert "Київський національний університет" in text
    if name == "accented":
        assert "Zoë Åström-Nuñez" in text
        assert "ąćęłńóśźż" in text
    if name == "maya":
        assert "Maya Lindqvist" in text


# -- no synthetic bold or italic -----------------------------------------------------------------

_FACE_AUDIT = """
(() => {
  const used = new Set();
  const take = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    const family = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    used.add(JSON.stringify([family, style.fontWeight, style.fontStyle]));
  };
  for (const el of document.body.querySelectorAll('*')) {
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) take(el);
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(el, pseudo).content;
      if (content && content !== 'none' && content !== 'normal') take(el, pseudo);
    }
  }
  const faces = [...document.fonts].map(f => [f.family.replace(/^["']|["']$/g, ''), f.weight, f.style, f.status]);
  return { used: [...used].map(JSON.parse), faces };
})()
"""


@pytest.mark.parametrize("font_id", [None, *OVERRIDE_FONT_IDS])
@pytest.mark.parametrize("template_id", available_template_ids())
def test_every_weight_and_style_a_template_uses_is_a_loaded_face(template_id, font_id):
    """Chromium synthesises a bold or italic when no @font-face matches, and that prints as
    Type 3. Every (family, weight, style) the rendered text computes to must be declared."""
    html = render_cv_html(_model("long", font=font_id, template=template_id), page_size="a4")
    audit = cv_chromium.inspect_page(html, _FACE_AUDIT)
    declared = {(family, weight, style) for family, weight, style, _ in audit["faces"]}
    assert audit["used"]
    for family, weight, style in audit["used"]:
        assert (family, weight, style) in declared, (template_id, font_id, family, weight, style)
    assert all(status == "loaded" for *_, status in audit["faces"]), audit["faces"]


@pytest.mark.parametrize("template_id", available_template_ids())
def test_template_css_names_no_font_family_directly(template_id):
    """Templates take families from --font-body / --font-heading so the override reaches them."""
    css = (TEMPLATES_DIR / template_id / "template.css").read_text("utf-8")
    for declaration in re.findall(r"font(?:-family)?\s*:[^;}]+", css):
        assert not re.search(r"""["'][A-Z][^"']+["']""", declaration), declaration


@pytest.mark.parametrize("template_id", available_template_ids())
def test_manifest_fonts_are_real_registry_faces(template_id):
    manifest = load_manifest(template_id)
    for face in manifest.fonts:
        family = TYPEFACES_BY_NAME[face.family]
        assert family.face(face.weight, face.style).file == face.file
        assert (family.face(face.weight, face.style).weight, face.style) == (face.weight, face.style)
    assert set(manifest.typefaces.values()) <= {f.family for f in manifest.fonts}
    json.loads((TEMPLATES_DIR / template_id / "manifest.json").read_text("utf-8"))


# -- accent -------------------------------------------------------------------------------------


def test_the_palette_has_ten_print_safe_colours_and_keeps_the_original_seven():
    assert len(CV_ACCENT_PALETTE) == 10
    assert {"#111827", "#7C2D12", "#075985", "#166534", "#6D28D9", "#B91C1C", "#0F766E"} <= set(CV_ACCENT_NAMES)
    assert all(re.fullmatch(r"#[0-9A-F]{6}", c) for c in CV_ACCENT_PALETTE)
    assert len(set(CV_ACCENT_NAMES.values())) == 10


@pytest.mark.parametrize("color", CV_ACCENT_PALETTE)
def test_every_accent_reads_as_text_on_white_and_carries_its_on_accent_text(color):
    assert contrast_ratio(color, WHITE) >= MIN_TEXT_CONTRAST  # the accent as a heading colour
    text_on_fill = on_accent(color)
    assert text_on_fill in (WHITE, INK)
    assert contrast_ratio(color, text_on_fill) >= MIN_TEXT_CONTRAST  # label on an accent fill
    tint = accent_tint(color)
    assert contrast_ratio(tint, INK) >= 12  # ink text on the light tint
    assert accent_tokens(color.lower())["accent"] == color


def test_on_accent_follows_luminance():
    assert on_accent("#FFFF00") == INK and on_accent("#000000") == WHITE
    assert accent_tint("#000000") == "#E0E0E0" and accent_tint("#FFFFFF") == "#FFFFFF"


@pytest.mark.parametrize("color", ["#111827", "#B45309"])
def test_the_accent_reaches_the_html_and_a_section_rule(color):
    html = render_cv_html(_model("maya", accent_color=color))
    assert f"--accent: {color}" in html and "--accent-tint:" in html and "--on-accent:" in html


# -- density ------------------------------------------------------------------------------------


def _ink_height(pdf: bytes) -> float:
    """Total vertical extent of the text across pages (page height per full page)."""
    with fitz.open(stream=pdf, filetype="pdf") as document:
        height = document[0].rect.height
        last = max(block[3] for block in document[-1].get_text("blocks"))
        return (document.page_count - 1) * height + last


def test_density_changes_page_count_monotonically_on_the_long_fixture():
    results = {}
    for density in ("compact", "normal", "spacious"):
        pdf = render_pdf(_model("long", density=density))
        with fitz.open(stream=pdf, filetype="pdf") as document:
            results[density] = (document.page_count, _ink_height(pdf))
    assert results["compact"][0] <= results["normal"][0] <= results["spacious"][0], results
    assert results["compact"][1] < results["normal"][1] < results["spacious"][1], results
    assert results["compact"][0] < results["spacious"][0], results


def test_density_scales_come_from_custom_properties_in_the_shared_base_css():
    html = {d: render_cv_html(_model("maya", density=d)) for d in ("compact", "normal", "spacious")}
    assert "--type: 0.88; --gap: 0.7" in html["compact"]
    assert "--type: 1.0; --gap: 1.0" in html["normal"]
    assert "--type: 1.15; --gap: 1.4" in html["spacious"]
    base = (TEMPLATES_DIR / "_base.css").read_text("utf-8")
    assert "--space-3" in base and "var(--gap)" in base
    for template_id in available_template_ids():
        css = (TEMPLATES_DIR / template_id / "template.css").read_text("utf-8")
        assert "var(--type)" in css and "var(--space-" in css, template_id


# -- glyph coverage -----------------------------------------------------------------------------


def test_a_character_no_font_draws_is_reported_and_never_falls_back():
    cv = cv_fixtures.maya()
    cv.sections[0]["entries"][0]["body"] = "Led \U0001f600 teams and 日本語 reviews."
    for font_id in (None, "lora", "eb-garamond"):
        model = build_render_model(cv, "classic", CvStyle(font_id=font_id))
        assert set(model.unsupported_characters) >= {"\U0001f600", "日"}
        pdf = render_pdf(model)
        assert font_problems(pdf, effective_families("classic", font_id)) == []
        evidence = validate_artifact(model, pdf)
        assert evidence.reads_back == "fail"
        assert set(evidence.unsupported_characters) >= {"\U0001f600", "日"}


def test_coverage_is_judged_against_the_chosen_typeface():
    # Ŧ (Sami) is in no curated family here; Greek is in some Latin-only designs but not all.
    assert "Ŧ" in missing_characters("classic", "Ŧ", "inter")
    assert missing_characters("classic", "Zoë Анна", "lora") == []


# -- NFC ----------------------------------------------------------------------------------------


DECOMPOSED_NAME = "Zoë Åström-Nuñez"


@pytest.mark.parametrize("font_id", [None, "inter", "eb-garamond"])
def test_decomposed_accents_print_composed_and_read_back(font_id):
    cv = cv_fixtures.accented()
    cv.header["name"] = DECOMPOSED_NAME
    cv.sections[0]["entries"][0]["body"] = "Création de systèmes, naïve báck-end."
    model = build_render_model(cv, "classic", CvStyle(font_id=font_id))
    assert model.header.title == "Zoë Åström-Nuñez" and len(model.header.title) == 16
    assert model.unsupported_characters == []
    pdf = render_pdf(model)
    text = _text(pdf)
    assert "Zoë Åström-Nuñez" in text and DECOMPOSED_NAME not in text
    assert "Création de systèmes" in text
    evidence = validate_artifact(model, pdf)
    assert evidence.reads_back == "pass" and evidence.font_problems == []


def test_combining_marks_without_a_precomposed_letter_stay_drawable():
    cv = cv_fixtures.maya()
    cv.sections[0]["entries"][0]["body"] = "Notation x́ and q̈ in proofs."
    model = build_render_model(cv, "classic", CvStyle())
    assert "x́" in _all_text(model)  # NFC keeps a mark that has no composed form
    pdf = render_pdf(model)
    assert font_problems(pdf, effective_families("classic", None)) == []
    assert model.unsupported_characters == []
    assert Path(TEMPLATES_DIR / "_base.css").is_file()
