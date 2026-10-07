"""CV Studio style/customization + structured-entry coverage (#322)."""

import io
import zipfile

import fitz

from app.schemas.cv_documents import CV_ACCENT_PALETTE, CvDocumentCreate, CvStyle
from app.services.cv_documents import create_document
from app.services.cv_fonts import FONT_FAMILIES, OVERRIDE_FONT_IDS, register_fonts
from app.services.cv_html import effective_families, load_manifest
from app.services.cv_pdf import embedded_fonts, font_problems
from app.services.cv_rendering import (
    TEMPLATES,
    build_render_model,
    render_docx,
    render_pdf,
    resolve_effective_style,
)

PREFIX = "/api/v1/cv-documents"


def _structured_document(db, test_user):
    return create_document(
        db,
        test_user.id,
        CvDocumentCreate(
            name="Structured CV",
            sections=[
                {
                    "id": "experience",
                    "kind": "experience",
                    "title": "Experience",
                    "position": 0,
                    "entries": [
                        {
                            "id": "e1",
                            "evidence_item_id": None,
                            "body": "Led the platform migration.",
                            "position": 0,
                            "heading": "Senior Engineer",
                            "subheading": "Synthetic Corp",
                            "location": "Remote",
                            "start_date": "Jan 2022",
                            "end_date": "Present",
                            "bullets": [
                                "Migrated 40 services with zero downtime.",
                                "Mentored four engineers.",
                            ],
                        }
                    ],
                },
                {
                    "id": "skills",
                    "kind": "skills",
                    "title": "Skills",
                    "position": 1,
                    "entries": [
                        {
                            "id": "s1",
                            "evidence_item_id": None,
                            "body": "Python, TypeScript, PostgreSQL",
                            "position": 0,
                        }
                    ],
                },
            ],
        ),
    )


# --- Fonts ---------------------------------------------------------------


def test_all_bundled_fonts_register_and_render_deterministically(db, test_user):
    register_fonts()
    document = _structured_document(db, test_user)
    for font_id in OVERRIDE_FONT_IDS:
        style = CvStyle(template_id="classic", font_id=font_id, accent_color="#111827")
        model = build_render_model(document, "classic", style)
        pdf_a = render_pdf(model)
        pdf_b = render_pdf(model)
        assert pdf_a == pdf_b
        docx_a = render_docx(model)
        docx_b = render_docx(model)
        assert docx_a == docx_b


# --- Style resolution ------------------------------------------------------


def test_unstyled_cv_exports_in_the_font_its_preview_shows(client, auth_headers, db, test_user):
    """A CV that was never restyled previews with the default style; every
    rendered artifact (export, "View exact PDF", the ATS check) must match it."""
    document = _structured_document(db, test_user)
    assert document.style is None
    # No typeface override: the template's own pair prints .
    assert client.get(f"{PREFIX}/{document.id}", headers=auth_headers).json()["style"]["font_id"] is None
    family = load_manifest("classic").typefaces["body"]

    pdf = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    docx = client.get(f"{PREFIX}/{document.id}/artifacts/docx", headers=auth_headers)

    assert pdf.status_code == 200 and docx.status_code == 200
    # No override: the PDF prints classic's own pair. Only fonts of the template are
    # embedded (no Type 3, no fallback face).
    assert embedded_fonts(pdf.content)
    assert font_problems(pdf.content, load_manifest("classic").families) == []
    with zipfile.ZipFile(io.BytesIO(docx.content)) as archive:
        styles_xml = archive.read("word/styles.xml").decode()
    # The DOCX prints the template's own pair too (T10), set in the styles.
    assert f'w:ascii="{family}"' in styles_xml and "Source Serif 4" in styles_xml


def test_ats_mode_forces_single_column_standard_font_neutral_accent():
    # A legacy id still parses (it maps to lagoon); ATS mode forces classic whatever it is.
    style = CvStyle(
        template_id="modern-two-column", font_id="crimson-text", accent_color="#B91C1C", ats_mode=True
    )
    assert style.template_id == "lagoon"
    effective = resolve_effective_style("lagoon", style)
    assert effective.layout_template_id == "classic"
    assert effective.font_docx_name == "Helvetica"
    assert effective.accent == "#111827"
    assert effective.two_column is False


def test_density_scales_type_and_gap_size():
    compact = resolve_effective_style("classic", CvStyle(density="compact"))
    spacious = resolve_effective_style("classic", CvStyle(density="spacious"))
    assert compact.body_size <= TEMPLATES["classic"].body_size <= spacious.body_size
    assert compact.section_gap < spacious.section_gap


def test_accent_color_outside_curated_palette_is_rejected():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CvStyle(accent_color="#ABCDEF")


def test_no_accent_means_the_templates_own_colour_and_ink_is_a_choice():
    # Null (the default) prints the template's manifest colour; a stored style from before
    # the field was nullable holds a palette colour and keeps printing exactly that (#471).
    assert CvStyle().accent_color is None
    assert CvStyle.model_validate({"accent_color": None}).accent_color is None
    assert resolve_effective_style("lagoon", CvStyle()).accent == "#0F766E"
    assert resolve_effective_style("frame", CvStyle()).accent == "#075985"
    assert resolve_effective_style("classic", CvStyle()).accent == "#111827"
    stored = CvStyle.model_validate({"template_id": "modern-two-column", "accent_color": "#111827"})
    assert resolve_effective_style(stored.template_id, stored).accent == "#111827"
    assert resolve_effective_style("lagoon", CvStyle(accent_color="#111827", ats_mode=True)).accent == "#111827"


# --- Structured entries ----------------------------------------------------


def test_structured_entry_renders_heading_subheading_dates_and_bullets(db, test_user):
    document = _structured_document(db, test_user)
    model = build_render_model(document, "classic", CvStyle())
    entry = model.sections[0].entries[0]
    assert entry.heading == "Senior Engineer"
    assert entry.subheading == "Synthetic Corp"
    assert entry.dates == "Jan 2022 – Present"
    assert entry.paragraph is None  # bullets render instead of the body
    assert len(entry.bullets) == 2

    pdf = render_pdf(model)
    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        text = "".join(page.get_text() for page in parsed)
    assert "Senior Engineer" in text
    assert "Synthetic Corp" in text
    assert "Migrated 40 services with zero downtime." in text

    docx = render_docx(model)
    assert docx  # renders without raising


def test_legacy_body_only_entry_still_renders_as_single_paragraph(db, test_user):
    document = _structured_document(db, test_user)
    model = build_render_model(document, "classic", CvStyle())
    skills_entry = model.sections[1].entries[0]
    assert skills_entry.heading is None
    assert skills_entry.paragraph == "Python, TypeScript, PostgreSQL"


def test_a_sidebar_template_without_a_template_dir_prints_as_classic(db, test_user):
    # meadow is a valid id whose template is not built (spec section 9); it renders as classic.
    document = _structured_document(db, test_user)
    model = build_render_model(document, "meadow", CvStyle(template_id="meadow"))
    assert model.template_id == "classic"
    assert model.tokens["two_column"] is False
    pdf = render_pdf(model)
    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        assert parsed.page_count >= 1
        text = "".join(page.get_text() for page in parsed)
    assert "Skills" in text and "Senior Engineer" in text
    docx = render_docx(model)
    assert docx


# --- Router: style catalog, PATCH style, export -----------------------------


def test_style_catalog_is_the_single_source_of_design_values(client, auth_headers):
    response = client.get(f"{PREFIX}/style-catalog", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    templates = {t["id"]: t for t in body["templates"]}
    assert list(templates) == list(TEMPLATES)
    assert list(templates)[0] == "classic"  # the default leads; T6-T8 add the rest
    assert templates["classic"]["name"] == "Classic"
    assert [f["id"] for f in body["fonts"]] == list(OVERRIDE_FONT_IDS)
    assert len(body["palette"]) == 10
    assert all(f["css_family"].startswith(f"'{f['name']}'") for f in body["fonts"])
    assert [d["id"] for d in body["densities"]] == ["compact", "normal", "spacious"]
    assert {c["value"] for c in body["palette"]} == set(CV_ACCENT_PALETTE)
    classic = templates["classic"]
    assert classic["ats_safe"] is True and classic["columns"] == 1
    assert classic["group"] == "ats-safe" and classic["photo_slot"] is False
    assert classic["typefaces"] == {"heading": "Source Serif 4", "body": "Source Sans 3"}
    assert classic["sidebar_kinds"] == []
    assert classic["title_align"] == "center"
    # The per-density sizes the preview uses are exactly what the renderer uses.
    for template_id, template in templates.items():
        for density, sizes in template["sizes"].items():
            effective = resolve_effective_style(template_id, CvStyle(density=density))
            assert sizes == {
                "body_pt": effective.body_size,
                "heading_pt": effective.heading_size,
                "section_gap_pt": effective.section_gap,
            }
            assert template["margin_mm"] == effective.margin_mm
    ats = resolve_effective_style("lagoon", CvStyle(ats_mode=True))
    assert body["ats_mode"]["template_id"] == ats.layout_template_id == "classic"
    assert body["ats_mode"]["offered_template_ids"] == [
        tid for tid, t in templates.items() if t["ats_safe"]
    ]
    assert body["ats_mode"]["accent"] == ats.accent


def test_style_catalog_requires_authentication(client):
    assert client.get(f"{PREFIX}/style-catalog").status_code in (401, 403)


def test_patch_style_persists_and_defaults_for_legacy_documents(client, auth_headers):
    created = client.post(PREFIX, json={"name": "Doc"}, headers=auth_headers).json()
    assert created["style"] == CvStyle().model_dump()

    patched = client.patch(
        f"{PREFIX}/{created['id']}",
        json={
            "style": {
                "template_id": "executive",
                "font_id": "pt-serif",
                "accent_color": "#166534",
                "density": "spacious",
                "ats_mode": False,
            }
        },
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["style"]["template_id"] == "executive"
    # A legacy typeface id is stored as the nearest curated family.
    assert patched.json()["style"]["font_id"] == "source-serif-4"

    fetched = client.get(f"{PREFIX}/{created['id']}", headers=auth_headers).json()
    assert fetched["style"]["accent_color"] == "#166534"


def test_artifact_export_uses_the_saved_style(client, auth_headers, db, test_user):
    document = _structured_document(db, test_user)
    client.patch(
        f"{PREFIX}/{document.id}",
        json={"style": {"template_id": "executive", "font_id": "crimson-text"}},
        headers=auth_headers,
    )
    response = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    assert response.status_code == 200
    # executive has no template directory yet (T7), so it prints, and is named, as classic.
    assert "Structured-CV-classic.pdf" in response.headers["content-disposition"]
    # crimson-text maps to Lora: the saved typeface prints (body; classic's heading stays serif too).
    assert effective_families("classic", "lora") == frozenset({"Lora"})
    assert font_problems(response.content, effective_families("classic", "lora")) == []
    assert {font.name.split("-")[0] for font in embedded_fonts(response.content)} == {"Lora"}


def test_style_rejects_the_removed_section_order_field():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CvStyle(section_order=["experience"])
