"""CV Studio style/customization + structured-entry coverage (#322)."""

import io
import zipfile

import fitz

from app.schemas.cv_documents import CvDocumentCreate, CvStyle
from app.services.cv_documents import create_document
from app.services.cv_fonts import FONT_FAMILIES, register_fonts
from app.services.cv_rendering import (
    ATS_SAFE_TEMPLATES,
    TEMPLATES,
    build_render_model,
    render_docx,
    render_pdf,
    resolve_effective_style,
    validate_artifact,
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
    for font_id in FONT_FAMILIES:
        style = CvStyle(template_id="ats-essential", font_id=font_id, accent_color="#111827")
        model = build_render_model(document, "ats-essential", style)
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
    preview_font = client.get(f"{PREFIX}/{document.id}", headers=auth_headers).json()["style"][
        "font_id"
    ]
    family = FONT_FAMILIES[preview_font]

    pdf = client.get(
        f"{PREFIX}/{document.id}/artifacts/pdf?template=ats-essential", headers=auth_headers
    )
    docx = client.get(
        f"{PREFIX}/{document.id}/artifacts/docx?template=ats-essential", headers=auth_headers
    )

    assert pdf.status_code == 200 and docx.status_code == 200
    with fitz.open(stream=pdf.content, filetype="pdf") as parsed:
        # Fonts of the glyphs actually drawn (ReportLab also lists an unused
        # Helvetica resource on every page, so page.get_fonts() is not enough).
        drawn_fonts = {
            span["font"]
            for page in parsed
            for block in page.get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
        }
    assert drawn_fonts and all(family.pdf_name in font for font in drawn_fonts), drawn_fonts
    with zipfile.ZipFile(io.BytesIO(docx.content)) as archive:
        document_xml = archive.read("word/document.xml").decode()
    assert f'w:ascii="{family.name}"' in document_xml


def test_ats_mode_forces_single_column_standard_font_neutral_accent():
    style = CvStyle(
        template_id="modern-two-column", font_id="crimson-text", accent_color="#B91C1C", ats_mode=True
    )
    effective = resolve_effective_style("modern-two-column", style)
    assert effective.layout_template_id == "ats-essential"
    assert effective.font_name == "Helvetica"
    assert effective.accent == "#111827"
    assert effective.two_column is False


def test_density_scales_type_and_gap_size():
    compact = resolve_effective_style("ats-essential", CvStyle(density="compact"))
    spacious = resolve_effective_style("ats-essential", CvStyle(density="spacious"))
    assert compact.body_size <= TEMPLATES["ats-essential"].body_size <= spacious.body_size
    assert compact.section_gap < spacious.section_gap


def test_accent_color_outside_curated_palette_is_rejected():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CvStyle(accent_color="#ABCDEF")


# --- Structured entries ----------------------------------------------------


def test_structured_entry_renders_heading_subheading_dates_and_bullets(db, test_user):
    document = _structured_document(db, test_user)
    model = build_render_model(document, "ats-essential", CvStyle())
    entry = model.sections[0].entries[0]
    assert entry.heading == "Senior Engineer"
    assert entry.subheading == "Synthetic Corp"
    assert entry.start_date == "Jan 2022"
    assert entry.end_date == "Present"
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
    model = build_render_model(document, "ats-essential", CvStyle())
    skills_entry = model.sections[1].entries[0]
    assert skills_entry.heading is None
    assert skills_entry.text == "Python, TypeScript, PostgreSQL"


def test_modern_two_column_template_renders_pdf_with_sidebar(db, test_user):
    document = _structured_document(db, test_user)
    model = build_render_model(
        document, "modern-two-column", CvStyle(template_id="modern-two-column")
    )
    assert model.tokens["two_column"] is True
    pdf = render_pdf(model)
    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        assert parsed.page_count >= 1
        text = "".join(page.get_text() for page in parsed)
    assert "Skills" in text and "Senior Engineer" in text
    # DOCX degrades to single column but still renders every section.
    docx = render_docx(model)
    assert docx


# --- Router: style catalog, PATCH style, render-model -----------------------


def test_style_catalog_lists_five_templates_and_five_fonts(client, auth_headers):
    response = client.get(f"{PREFIX}/style-catalog", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert {t["id"] for t in body["templates"]} == set(TEMPLATES)
    assert {f["id"] for f in body["fonts"]} == set(FONT_FAMILIES)
    assert body["densities"] == ["compact", "normal", "spacious"]
    assert len(body["palette"]) >= 5
    two_col = next(t for t in body["templates"] if t["id"] == "modern-two-column")
    assert two_col["ats_safe"] is False


def test_style_catalog_requires_authentication(client):
    assert client.get(f"{PREFIX}/style-catalog").status_code in (401, 403)


def test_patch_style_persists_and_defaults_for_legacy_documents(client, auth_headers):
    created = client.post(PREFIX, json={"name": "Doc"}, headers=auth_headers).json()
    assert created["style"] == CvStyle().model_dump()

    patched = client.patch(
        f"{PREFIX}/{created['id']}",
        json={
            "style": {
                "template_id": "minimal-serif",
                "font_id": "pt-serif",
                "accent_color": "#166534",
                "density": "spacious",
                "ats_mode": False,
            }
        },
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["style"]["template_id"] == "minimal-serif"
    assert patched.json()["style"]["font_id"] == "pt-serif"

    fetched = client.get(f"{PREFIX}/{created['id']}", headers=auth_headers).json()
    assert fetched["style"]["accent_color"] == "#166534"


def test_render_model_endpoint_accepts_unsaved_style_overrides(client, auth_headers):
    created = client.post(PREFIX, json={"name": "Preview doc"}, headers=auth_headers).json()
    response = client.get(
        f"{PREFIX}/{created['id']}/render-model",
        params={"template_id": "technical-portfolio", "ats_mode": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["template_id"] == "ats-essential"  # ats_mode forces the safe layout
    assert body["tokens"]["ats_mode"] is True


def test_artifact_export_honors_saved_style(client, auth_headers, db, test_user):
    document = _structured_document(db, test_user)
    client.patch(
        f"{PREFIX}/{document.id}",
        json={"style": {"font_id": "crimson-text", "accent_color": "#7C2D12"}},
        headers=auth_headers,
    )
    response = client.get(
        f"{PREFIX}/{document.id}/artifacts/pdf?template=ats-essential",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.headers["x-cv-canonical-hash"]
