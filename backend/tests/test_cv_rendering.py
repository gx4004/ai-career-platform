import shutil
import subprocess

import fitz
import pytest

from app.schemas.cv_documents import CvDocumentCreate, CvStyle
from app.services.cv_documents import create_document
from app.services.cv_rendering import (
    TEMPLATES,
    build_render_model,
    render_docx,
    render_pdf,
    validate_artifact,
)


def _document(db, test_user):
    return create_document(
        db,
        test_user.id,
        CvDocumentCreate(
            name="Synthetic CV",
            sections=[
                {
                    "id": "summary",
                    "kind": "summary",
                    "title": "Summary",
                    "position": 0,
                    "entries": [
                        {
                            "id": "s1",
                            "evidence_item_id": None,
                            "body": "Engineer building accessible systems.",
                            "position": 0,
                        }
                    ],
                },
                {
                    "id": "projects",
                    "kind": "projects",
                    "title": "Projects",
                    "position": 1,
                    "entries": [
                        {
                            "id": "p1",
                            "evidence_item_id": None,
                            "body": "Portfolio: https://example.com/work",
                            "position": 0,
                        }
                    ],
                },
            ],
        ),
    )


def _model(document, template: str):
    """Render the way the app does for a document with no saved style."""
    return build_render_model(document, template, CvStyle(template_id=template))


def test_catalog_templates_share_canonical_render_model(db, test_user):
    document = _document(db, test_user)
    assert list(TEMPLATES)[0] == "classic"  # the default leads; T6-T8 add the rest from their directories
    models = [_model(document, template) for template in TEMPLATES]
    assert all(model.sections == models[0].sections for model in models)
    assert [model.template_id for model in models] == list(TEMPLATES)


def test_unavailable_template_ids_build_the_classic_model(db, test_user):
    document = _document(db, test_user)
    for template in ("academic", "meadow", "ledger"):  # ids with no template directory (spec 9)
        assert _model(document, template).template_id == "classic"


def test_docx_and_pdf_are_byte_stable_and_validate_for_every_template(db, test_user):
    document = _document(db, test_user)
    for template in TEMPLATES:
        model = _model(document, template)
        docx = render_docx(model)
        pdf = render_pdf(model)
        assert docx == render_docx(model)
        assert pdf == render_pdf(model)
        evidence = validate_artifact(model, pdf)
        assert evidence.reads_back == "pass"
        assert evidence.links == "pass"
        with fitz.open(stream=pdf, filetype="pdf") as parsed:
            text = "".join(page.get_text() for page in parsed)
            # The paper opens with the candidate's name, not the internal document name.
            assert "Test User" in text
            assert "Synthetic CV" not in text
            assert any(
                link["uri"] == "https://example.com/work"
                for page in parsed
                for link in page.get_links()
            )


def test_boundary_fixture_keeps_heading_with_following_entry(db, test_user):
    document = _document(db, test_user)
    document.sections[0]["entries"] *= 65
    for template in TEMPLATES:
        pdf = render_pdf(_model(document, template))
        with fitz.open(stream=pdf, filetype="pdf") as parsed:
            assert parsed.page_count > 1
            assert all(page.get_text().strip() for page in parsed)
            pages = [page.get_text() for page in parsed]
            for section in _model(document, template).sections:
                assert any(
                    section.title in page and section.entries[0].text in page for page in pages
                )


def test_docx_boundary_fixture_renders_every_template_without_orphaned_headings(
    db, test_user, tmp_path
):
    soffice = shutil.which("soffice")
    if soffice is None:
        pytest.skip("LibreOffice (soffice) is not installed")
    document = _document(db, test_user)
    document.sections[0]["entries"] *= 65
    for template in TEMPLATES:
        output_dir = tmp_path / template
        profile_dir = tmp_path / f"profile-{template}"
        output_dir.mkdir()
        profile_dir.mkdir()
        path = output_dir / f"{template}.docx"
        path.write_bytes(render_docx(_model(document, template)))
        subprocess.run(
            [
                soffice,
                f"-env:UserInstallation={profile_dir.resolve().as_uri()}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(output_dir),
                str(path),
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        rendered_pdf = output_dir / f"{template}.pdf"
        assert rendered_pdf.exists(), "LibreOffice did not produce the expected PDF"
        with fitz.open(rendered_pdf) as pdf:
            assert pdf.page_count > 1
            # LibreOffice's font substitution can leave glyph gaps (e.g. a "tt"
            # ligature in "https") that PyMuPDF would otherwise read as spaces.
            pages = [page.get_text(flags=fitz.TEXT_INHIBIT_SPACES) for page in pdf]
            assert all(page.strip() for page in pages)
            for section in _model(document, template).sections:
                # Some templates set their section headings in capitals (display only).
                assert any(
                    section.title.casefold() in page.casefold() and section.entries[0].text in page
                    for page in pages
                )


def test_link_parser_excludes_sentence_punctuation(db, test_user):
    document = _document(db, test_user)
    document.sections[1]["entries"][0]["body"] = "See https://example.com/work."
    model = _model(document, "classic")
    assert model.sections[1].entries[0].links == ["https://example.com/work"]
    assert validate_artifact(model, render_pdf(model)).links == "pass"


def test_wrapped_first_entry_stays_with_its_heading(db, test_user):
    document = _document(db, test_user)
    document.sections[1]["entries"][0]["body"] = " ".join(["deterministic"] * 80)
    for template in TEMPLATES:
        model = _model(document, template)
        assert validate_artifact(model, render_pdf(model)).page_breaks == "pass"


def test_structured_entry_scores_the_same_as_its_plain_text_equivalent(db, test_user):
    """A structured entry (heading/subheading/dates/bullets) renders as title +
    bullets, not its unrendered body — the artifact-validation checks must
    compare against what actually renders, so a structured CV isn't scored
    worse than an equivalent plain-body CV with the same visible content (#322).
    """
    structured = create_document(
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
                            "body": "Senior Engineer",
                            "position": 0,
                            "heading": "Senior Engineer",
                            "subheading": "Acme Corp",
                            "location": "Remote",
                            "start_date": "2020",
                            "end_date": "2022",
                            "bullets": [
                                "Reduced processing time by 34% for 12 teams.",
                                "Built an accessible workflow used by 1,800 accounts.",
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
                            "body": "Python, TypeScript, AWS",
                            "position": 0,
                        }
                    ],
                },
            ],
        ),
    )
    plain = create_document(
        db,
        test_user.id,
        CvDocumentCreate(
            name="Plain CV",
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
                            "body": (
                                "Senior Engineer — Acme Corp 2020 – 2022 Remote "
                                "Reduced processing time by 34% for 12 teams. "
                                "Built an accessible workflow used by 1,800 accounts."
                            ),
                            "position": 0,
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
                            "body": "Python, TypeScript, AWS",
                            "position": 0,
                        }
                    ],
                },
            ],
        ),
    )
    for document in (structured, plain):
        model = _model(document, "classic")
        evidence = validate_artifact(model, render_pdf(model))
        assert evidence.reads_back == "pass"
        assert evidence.page_breaks == "pass"


def test_artifact_routes_are_owner_isolated_and_return_safe_headers(
    client, auth_headers, db, test_user
):
    document = _document(db, test_user)
    url = f"/api/v1/cv-documents/{document.id}/artifacts/pdf"
    response = client.get(url, headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="Synthetic-CV-classic.pdf"'
    )
    assert client.get(url).status_code == 401


def test_font_route_serves_only_allowlisted_bundled_filenames_with_long_cache(client):
    response = client.get("/api/v1/cv-documents/fonts/Lato-Regular.ttf")
    assert response.status_code == 200
    assert response.headers["content-type"] in ("font/ttf", "application/font-sfnt")
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.content[:4] in (b"\x00\x01\x00\x00", b"true", b"OTTO")

    traversal = client.get("/api/v1/cv-documents/fonts/..%2Fcv_documents.py")
    assert traversal.status_code == 404
    assert client.get("/api/v1/cv-documents/fonts/Comic-Sans.ttf").status_code == 404


def test_export_filename_is_ascii_and_bounded(client, auth_headers, db, test_user):
    document = _document(db, test_user)
    document.name = "Résumé\r\nInjected: value " + "x" * 200
    db.commit()
    response = client.get(
        f"/api/v1/cv-documents/{document.id}/artifacts/docx",
        headers=auth_headers,
    )
    disposition = response.headers["content-disposition"]
    assert response.status_code == 200
    assert "\r" not in disposition and "\n" not in disposition
    assert len(disposition) < 160
