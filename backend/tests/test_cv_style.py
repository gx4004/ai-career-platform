"""CV Studio style/customization + structured-entry coverage (#322)."""

import io
import zipfile

import fitz

from app.schemas.cv_documents import CV_ACCENT_PALETTE, CvDocumentCreate, CvStyle
from app.services.cv_documents import create_document
from app.services.cv_fonts import FONT_FAMILIES, register_fonts
from app.services.cv_html import load_manifest
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

    pdf = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    docx = client.get(f"{PREFIX}/{document.id}/artifacts/docx", headers=auth_headers)

    assert pdf.status_code == 200 and docx.status_code == 200
    # TODO(#461, T4): the PDF's typeface comes from the template until the typeface
    # override lands; it is `classic`'s pair whatever `font_id` says. Only fonts of the
    # template are embedded (no Type 3, no fallback face).
    assert embedded_fonts(pdf.content)
    assert font_problems(pdf.content, load_manifest("classic").families) == []
    with zipfile.ZipFile(io.BytesIO(docx.content)) as archive:
        document_xml = archive.read("word/document.xml").decode()
    assert f'w:ascii="{family.name}"' in document_xml


def test_ats_mode_forces_single_column_standard_font_neutral_accent():
    style = CvStyle(
        template_id="modern-two-column", font_id="crimson-text", accent_color="#B91C1C", ats_mode=True
    )
    effective = resolve_effective_style("modern-two-column", style)
    assert effective.layout_template_id == "ats-essential"
    assert effective.font_docx_name == "Helvetica"
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
    model = build_render_model(document, "ats-essential", CvStyle())
    skills_entry = model.sections[1].entries[0]
    assert skills_entry.heading is None
    assert skills_entry.paragraph == "Python, TypeScript, PostgreSQL"


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


# --- Router: style catalog, PATCH style, export -----------------------------


def test_style_catalog_is_the_single_source_of_design_values(client, auth_headers):
    response = client.get(f"{PREFIX}/style-catalog", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    templates = {t["id"]: t for t in body["templates"]}
    assert list(templates) == list(TEMPLATES)
    assert templates["technical-portfolio"]["name"] == "Technical Portfolio"
    assert {f["id"] for f in body["fonts"]} == set(FONT_FAMILIES)
    assert all(f["css_family"].startswith(f"'{f['name']}'") for f in body["fonts"])
    assert [d["id"] for d in body["densities"]] == ["compact", "normal", "spacious"]
    assert {c["value"] for c in body["palette"]} == set(CV_ACCENT_PALETTE)
    two_col = templates["modern-two-column"]
    assert two_col["ats_safe"] is False
    assert two_col["sidebar_kinds"] == ["skills", "certifications"]
    assert templates["professional-editorial"]["title_align"] == "center"
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
    ats = resolve_effective_style("modern-two-column", CvStyle(ats_mode=True))
    assert body["ats_mode"]["template_id"] == ats.layout_template_id
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


def test_artifact_export_uses_the_saved_style(client, auth_headers, db, test_user):
    document = _structured_document(db, test_user)
    client.patch(
        f"{PREFIX}/{document.id}",
        json={"style": {"template_id": "minimal-serif", "font_id": "crimson-text"}},
        headers=auth_headers,
    )
    response = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    assert response.status_code == 200
    assert "Structured-CV-minimal-serif.pdf" in response.headers["content-disposition"]
    # TODO(#461, T4): every legacy template prints as `classic` for now, so the saved
    # `font_id` does not change the PDF's typeface yet.
    assert font_problems(response.content, load_manifest("classic").families) == []


def test_style_rejects_the_removed_section_order_field():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CvStyle(section_order=["experience"])
