import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import fitz

from app.schemas.cv_documents import CvDocumentCreate
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


def test_exactly_three_declarative_templates_share_canonical_render_model(db, test_user):
    document = _document(db, test_user)
    assert list(TEMPLATES) == ["ats-essential", "professional-editorial", "technical-portfolio"]
    models = [build_render_model(document, template) for template in TEMPLATES]
    assert all(model.sections == models[0].sections for model in models)
    assert len({model.canonical_hash for model in models}) == 3


def test_docx_and_pdf_are_byte_stable_and_validate_for_every_template(db, test_user):
    document = _document(db, test_user)
    for template in TEMPLATES:
        model = build_render_model(document, template)
        docx = render_docx(model)
        pdf = render_pdf(model)
        assert docx == render_docx(model)
        assert pdf == render_pdf(model)
        assert validate_artifact(model, docx, "docx").model_dump(
            exclude={"format"}
        ) == validate_artifact(model, pdf, "pdf").model_dump(exclude={"format"})
        assert validate_artifact(model, pdf, "pdf").searchable_text == "pass"
        assert validate_artifact(model, pdf, "pdf").links == "pass"
        assert validate_artifact(model, pdf, "pdf").re_importability == "pass"
        with fitz.open(stream=pdf, filetype="pdf") as parsed:
            assert "Synthetic CV" in "".join(page.get_text() for page in parsed)
            assert any(
                link["uri"] == "https://example.com/work"
                for page in parsed
                for link in page.get_links()
            )


def test_every_template_matches_the_reviewed_pdf_layout_snapshot(db, test_user):
    expected = json.loads((Path(__file__).parent / "fixtures/cv_render_layouts.json").read_text())
    document = _document(db, test_user)
    for template in TEMPLATES:
        with fitz.open(
            stream=render_pdf(build_render_model(document, template)), filetype="pdf"
        ) as pdf:
            actual = [
                [*[round(value, 1) for value in block[:4]], block[4].strip()]
                for page in pdf
                for block in page.get_text("blocks")
            ]
        assert actual == expected[template]


def test_every_template_matches_the_reviewed_pixel_snapshot(db, test_user):
    expected = {
        "ats-essential": "50a1613b5e0675c73b595d7719a812eccbfae01bc63163bb1c05375dbf1b947e",
        "professional-editorial": "0d0492473a6e4fe48319dd0f0cdacd78cef79fb08885695a06c3c4e6ed300e21",
        "technical-portfolio": "6bfa4d7925f2e5ea7c391840e872db28a0f35a0ced93436c361cb5313357b84d",
    }
    document = _document(db, test_user)
    for template in TEMPLATES:
        with fitz.open(
            stream=render_pdf(build_render_model(document, template)), filetype="pdf"
        ) as pdf:
            pixmap = pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        assert (pixmap.width, pixmap.height) == (893, 1263)
        assert hashlib.sha256(pixmap.samples).hexdigest() == expected[template]


def test_boundary_fixture_keeps_heading_with_following_entry(db, test_user):
    document = _document(db, test_user)
    document.sections[0]["entries"] *= 65
    for template in TEMPLATES:
        pdf = render_pdf(build_render_model(document, template))
        with fitz.open(stream=pdf, filetype="pdf") as parsed:
            assert parsed.page_count > 1
            assert all(page.get_text().strip() for page in parsed)
            pages = [page.get_text() for page in parsed]
            for section in build_render_model(document, template).sections:
                assert any(
                    section.title in page and section.entries[0].text in page for page in pages
                )


def test_docx_boundary_fixture_renders_every_template_without_orphaned_headings(
    db, test_user, tmp_path
):
    soffice = shutil.which("soffice")
    assert soffice is not None, "Install LibreOffice to run the mandatory DOCX render gate"
    document = _document(db, test_user)
    document.sections[0]["entries"] *= 65
    for template in TEMPLATES:
        output_dir = tmp_path / template
        profile_dir = tmp_path / f"profile-{template}"
        output_dir.mkdir()
        profile_dir.mkdir()
        path = output_dir / f"{template}.docx"
        path.write_bytes(render_docx(build_render_model(document, template)))
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
            pages = [page.get_text() for page in pdf]
            assert all(page.strip() for page in pages)
            for section in build_render_model(document, template).sections:
                assert any(
                    section.title in page and section.entries[0].text in page for page in pages
                )


def test_link_parser_excludes_sentence_punctuation(db, test_user):
    document = _document(db, test_user)
    document.sections[1]["entries"][0]["body"] = "See https://example.com/work."
    model = build_render_model(document, "ats-essential")
    assert model.sections[1].entries[0].links == ["https://example.com/work"]
    assert validate_artifact(model, render_pdf(model), "pdf").links == "pass"


def test_wrapped_first_entry_stays_with_its_heading(db, test_user):
    document = _document(db, test_user)
    document.sections[1]["entries"][0]["body"] = " ".join(["deterministic"] * 80)
    for template in TEMPLATES:
        model = build_render_model(document, template)
        assert validate_artifact(model, render_pdf(model), "pdf").page_breaks == "pass"


def test_artifact_routes_are_owner_isolated_and_return_safe_headers(
    client, auth_headers, db, test_user
):
    document = _document(db, test_user)
    response = client.get(
        f"/api/v1/cv-documents/{document.id}/artifacts/pdf?template=ats-essential",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="Synthetic-CV-ats-essential.pdf"'
    )
    preview = client.get(
        f"/api/v1/cv-documents/{document.id}/render?template=ats-essential", headers=auth_headers
    )
    assert preview.status_code == 200
    assert (
        client.get(f"/api/v1/cv-documents/{document.id}/render?template=ats-essential").status_code
        == 401
    )


def test_quality_artifact_checks_only_promote_after_real_validation(
    client, auth_headers, db, test_user
):
    document = _document(db, test_user)
    url = f"/api/v1/cv-documents/{document.id}/quality"
    checks = ["text_layer", "links", "page_breaks", "re_importability"]
    baseline = client.post(
        url, json={"use_model": False, "checks": checks}, headers=auth_headers
    ).json()
    assert {check["status"] for check in baseline["ats_checks"]} == {"not_run"}
    validated = client.post(
        url,
        json={
            "use_model": False,
            "checks": checks,
            "artifact_template": "ats-essential",
            "artifact_format": "pdf",
        },
        headers=auth_headers,
    ).json()
    assert {check["status"] for check in validated["ats_checks"]} == {"pass"}
    assert all(
        "generated PDF artifact" in check["explanation"] for check in validated["ats_checks"]
    )


def test_export_filename_is_ascii_and_bounded(client, auth_headers, db, test_user):
    document = _document(db, test_user)
    document.name = "Résumé\r\nInjected: value " + "x" * 200
    db.commit()
    response = client.get(
        f"/api/v1/cv-documents/{document.id}/artifacts/docx?template=technical-portfolio",
        headers=auth_headers,
    )
    disposition = response.headers["content-disposition"]
    assert response.status_code == 200
    assert "\r" not in disposition and "\n" not in disposition
    assert len(disposition) < 160
