"""B6: CV render, export, ATS checks, versions and concurrent edits, at the HTTP seam.

Expected values come from the product contract (a long CV flows across pages
without a blank first page or a split role; text the font cannot draw is reported,
not dropped silently; a second writer is told, not overwritten), not from the code.
"""

import io

import fitz
import pytest
from docx import Document
from docx.shared import Mm

from app.schemas.cv_documents import CvDocumentCreate, CvStyle
from app.services.cv_documents import create_document
from app.services.cv_rendering import build_render_model, validate_artifact
from tests.test_cv_documents import _signed

PREFIX = "/api/v1/cv-documents"
A4_HEIGHT_PT = 842


def _entry(entry_id, position, **fields):
    entry = {"id": entry_id, "evidence_item_id": None, "position": position}
    entry.update(fields)
    entry.setdefault("body", fields.get("heading") or "Text")
    return entry


def _section(kind, title, position, entries):
    return {
        "id": f"s-{kind}",
        "kind": kind,
        "title": title,
        "visible": True,
        "position": position,
        "entries": entries,
    }


def _role(index):
    return _entry(
        f"role-{index}",
        index,
        heading=f"Role {index} Engineer",
        subheading=f"Company {index}",
        start_date="2016",
        end_date="2020",
        bullets=[
            f"Role {index} bullet {n}: delivered a measurable improvement to a production "
            f"system used by several teams and customers."
            for n in range(1, 6)
        ],
    )


def mid_cv_sections():
    """Summary, eight roles of five bullets, Skills and Education (the audit's mid2 fixture)."""
    return [
        _section(
            "summary",
            "Summary",
            0,
            [_entry("sum", 0, body="Backend engineer with a decade of experience building services.")],
        ),
        _section("experience", "Experience", 1, [_role(i) for i in range(1, 9)]),
        _section("skills", "Skills", 2, [_entry("sk", 0, body="Python, Go, PostgreSQL, Kubernetes")]),
        _section(
            "education",
            "Education",
            3,
            [
                _entry(
                    "ed",
                    0,
                    heading="BSc Computer Science",
                    subheading="University of Berlin",
                    start_date="2008",
                    end_date="2012",
                )
            ],
        ),
    ]


def _create(client, auth_headers, sections, name="Test CV", header=None):
    body = {"name": name, "sections": sections}
    if header is not None:
        body["header"] = header
    response = client.post(PREFIX, json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _pdf(client, auth_headers, document_id, **params):
    response = client.get(
        f"{PREFIX}/{document_id}/artifacts/pdf", params=params, headers=auth_headers
    )
    assert response.status_code == 200, response.text
    return response.content


def _quality(client, auth_headers, document_id, **params):
    response = client.post(
        f"{PREFIX}/{document_id}/quality", params=params, headers=auth_headers
    )
    assert response.status_code == 200, response.text
    return {check["id"]: check for check in response.json()["checks"]}


# ── d01: pagination ──


def test_long_cv_fills_the_first_page_and_never_splits_a_role(client, auth_headers):
    document = _create(client, auth_headers, mid_cv_sections())
    pdf = _pdf(client, auth_headers, document["id"])

    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        pages = [page.get_text() for page in parsed]
        # The first page carries real content, not just the title and Summary.
        first_page_bottom = max(block[3] for block in parsed[0].get_text("blocks"))
        assert first_page_bottom > 0.7 * A4_HEIGHT_PT
        assert "Role 1 Engineer" in pages[0]
        # Every role is whole: its heading and all five bullets share one page.
        for index in range(1, 9):
            holders = [i for i, text in enumerate(pages) if f"Role {index} Engineer" in text]
            assert len(holders) == 1
            text = pages[holders[0]]
            assert all(f"Role {index} bullet {n}:" in text for n in range(1, 6))
        # Nothing was lost to the reflow.
        assert "Education" in "".join(pages) and "BSc Computer Science" in "".join(pages)


def test_long_cv_passes_every_ats_check(client, auth_headers):
    document = _create(client, auth_headers, mid_cv_sections())
    checks = _quality(client, auth_headers, document["id"])
    assert all(check["passed"] for check in checks.values()), checks


def _page_gap_pdf(page_one_lines, page_two_lines):
    pdf = fitz.open()
    for lines in (page_one_lines, page_two_lines):
        page = pdf.new_page(width=595, height=842)
        y = 60
        for line in lines:
            page.insert_text((50, y), line, fontsize=11)
            y += 16
    data = pdf.tobytes()
    pdf.close()
    return data


def test_a_large_gap_at_the_bottom_of_a_non_final_page_fails_tidy_page_breaks(db, test_user):
    document = create_document(
        db,
        test_user.id,
        CvDocumentCreate(
            name="Gap", sections=[_section("summary", "Summary", 0, [_entry("a", 0, body="One short line.")])]
        ),
    )
    model = build_render_model(document, "ats-essential", CvStyle())

    # Page one holds a title and the summary only; the rest sits on page two.
    sparse = _page_gap_pdf(["Test User", "Summary", "One short line."], ["More content on page two."])
    assert validate_artifact(model, sparse).page_breaks == "fail"
    # A page that is simply full of content is fine.
    full = _page_gap_pdf(["Test User", "Summary", "One short line."] + ["filler"] * 44, ["More."])
    assert validate_artifact(model, full).page_breaks == "pass"


# ── d10: ATS check, imported CV ──

IMPORTED = """Casey Morgan
casey@example.com | Berlin, Germany

Summary
• Platform engineer focused on reliable systems.
- Mentors juniors.

Professional Experience
Senior Engineer at Northwind (2021 - Present)
* Cut p95 latency by 38%.
– Led 4 engineers through a migration.

Skills
• Python, Go
- Docker
"""


def test_an_imported_single_column_cv_reads_back(client, auth_headers):
    proposal = client.post(
        f"{PREFIX}/import/proposals",
        files={"file": ("cv.txt", io.BytesIO(IMPORTED.encode()), "text/plain")},
        headers=auth_headers,
    ).json()
    document = client.post(f"{PREFIX}/import/accept", json=proposal, headers=auth_headers).json()
    checks = _quality(client, auth_headers, document["id"])
    assert checks["reads_back"]["passed"], checks["reads_back"]
    assert checks["page_breaks"]["passed"]


# ── d08: text the font cannot draw ──


def _body_cv(text):
    return [_section("summary", "Summary", 0, [_entry("a", 0, body=text)])]


def _pdf_text(pdf):
    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        return " ".join(page.get_text() for page in parsed)


@pytest.mark.parametrize(
    "name", ["Дмитрий Соколов", "Αλέξανδρος Παπαδόπουλος", "Nguyễn Thị Hương", "Łukasz Żółć"]
)
@pytest.mark.parametrize(
    "style",
    [
        {"font_id": "lato"},
        {"font_id": "crimson-text", "template_id": "minimal-serif"},
        {"font_id": "ibm-plex-mono", "template_id": "technical-portfolio"},
        {"font_id": "pt-sans", "template_id": "professional-editorial"},
        {"ats_mode": True},
    ],
    ids=["lato", "crimson", "plex-mono", "pt-sans", "ats-mode"],
)
def test_names_in_scripts_some_bundled_font_covers_survive_the_pdf(
    client, auth_headers, name, style
):
    document = _create(client, auth_headers, _body_cv("Engineer."), header={"name": name})
    client.patch(f"{PREFIX}/{document['id']}", json={"style": style}, headers=auth_headers)
    assert name in _pdf_text(_pdf(client, auth_headers, document["id"]))
    assert _quality(client, auth_headers, document["id"])["reads_back"]["passed"]


def test_characters_no_bundled_font_can_draw_are_reported_not_silently_dropped(
    client, auth_headers
):
    document = _create(client, auth_headers, _body_cv("日本語テスト 😀 Backend engineer."))
    check = _quality(client, auth_headers, document["id"])["reads_back"]
    assert check["passed"] is False
    assert "日" in check["fix"] and "😀" in check["fix"]
    assert "ATS-friendly mode" not in check["fix"]


# ── d24: the reads-back advice names what failed ──


def test_reads_back_failure_names_the_section_that_did_not_read_back(client, auth_headers):
    sections = [
        _section("summary", "Summary", 0, [_entry("a", 0, body="Fine summary.")]),
        _section("experience", "Experience", 1, [_entry("b", 0, body="日本語テスト Backend.")]),
        _section("skills", "Skills", 2, [_entry("c", 0, body="Python")]),
    ]
    document = _create(client, auth_headers, sections)
    check = _quality(client, auth_headers, document["id"])["reads_back"]
    assert check["passed"] is False
    assert "Experience" in check["fix"]
    assert "Skills" not in check["fix"]


# ── d23: section headings check ──


@pytest.mark.parametrize(
    "kinds, expected",
    [
        (("experience", "skills"), True),
        (("education", "projects", "skills"), True),  # a graduate CV needs no Experience
        (("summary", "skills"), False),  # nothing says what the person did or studied
        (("experience",), False),  # a single heading is not a structure
    ],
)
def test_section_headings_check_accepts_standard_structures(client, auth_headers, kinds, expected):
    titles = {"experience": "Experience", "skills": "Skills", "education": "Education",
              "projects": "Projects", "summary": "Summary"}
    sections = [
        _section(kind, titles[kind], index, [_entry(f"e{index}", 0, body=f"{titles[kind]} text")])
        for index, kind in enumerate(kinds)
    ]
    document = _create(client, auth_headers, sections)
    assert _quality(client, auth_headers, document["id"])["sections"]["passed"] is expected


# ── d22: embedded fonts ──


def test_pdf_embeds_every_font_it_uses(client, auth_headers):
    document = _create(client, auth_headers, mid_cv_sections())
    client.patch(
        f"{PREFIX}/{document['id']}",
        json={"style": {"template_id": "professional-editorial", "font_id": "pt-serif"}},
        headers=auth_headers,
    )
    pdf = _pdf(client, auth_headers, document["id"])
    with fitz.open(stream=pdf, filetype="pdf") as parsed:
        fonts = {font[3]: font[1] for page in parsed for font in page.get_fonts()}
    assert fonts
    assert all(kind != "n/a" for kind in fonts.values()), fonts


# ── d03: two writers ──


def test_a_second_writer_with_a_stale_copy_gets_409_with_the_newer_version(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Original."))
    first_load = document["updated_at"]
    sections = document["sections"]

    tab_one = client.patch(
        f"{PREFIX}/{document['id']}",
        json={"name": "Renamed in tab one", "expected_updated_at": first_load},
        headers=auth_headers,
    )
    assert tab_one.status_code == 200

    sections[0]["entries"][0]["body"] = "Edited in tab two."
    tab_two = client.patch(
        f"{PREFIX}/{document['id']}",
        json={"sections": sections, "expected_updated_at": first_load},
        headers=auth_headers,
    )
    assert tab_two.status_code == 409
    body = tab_two.json()
    assert "another tab" in body["detail"].lower() or "changed" in body["detail"].lower()
    assert body["current"]["name"] == "Renamed in tab one"
    assert body["current"]["updated_at"] == tab_one.json()["updated_at"]
    # The loser did not overwrite anything.
    stored = client.get(f"{PREFIX}/{document['id']}", headers=auth_headers).json()
    assert stored["sections"][0]["entries"][0]["body"] == "Original."

    # Retrying on the newer version succeeds; omitting the field stays allowed.
    retry = client.patch(
        f"{PREFIX}/{document['id']}",
        json={"sections": sections, "expected_updated_at": body["current"]["updated_at"]},
        headers=auth_headers,
    )
    assert retry.status_code == 200
    unconditional = client.patch(
        f"{PREFIX}/{document['id']}", json={"name": "No precondition"}, headers=auth_headers
    )
    assert unconditional.status_code == 200


def test_counting_a_tailoring_run_does_not_invalidate_an_open_editor(
    client, auth_headers, monkeypatch
):
    async def no_changes(*_args, **_kwargs):
        return {"changes": []}

    monkeypatch.setattr("app.services.cv_tailoring.complete_structured", no_changes)
    document = _create(client, auth_headers, _body_cv("Original."))
    proposal = client.post(
        f"{PREFIX}/{document['id']}/tailoring",
        json={
            "job_title": "Platform Engineer",
            "job_description": "Platform engineer for distributed backend services.",
        },
        headers=auth_headers,
    )
    assert proposal.status_code == 200, proposal.text
    save = client.patch(
        f"{PREFIX}/{document['id']}",
        json={"name": "Still mine", "expected_updated_at": document["updated_at"]},
        headers=auth_headers,
    )
    assert save.status_code == 200, save.text


# ── d11: a saved version can be previewed, exported, renamed and deleted ──


def test_a_version_exports_without_touching_the_working_cv(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Working copy text."))
    variant = client.post(
        f"{PREFIX}/{document['id']}/variants",
        json={"name": "For Acme", "target_role": "Platform Engineer"},
        headers=auth_headers,
    ).json()
    sections = document["sections"]
    sections[0]["entries"][0]["body"] = "Edited after saving the version."
    client.patch(f"{PREFIX}/{document['id']}", json={"sections": sections}, headers=auth_headers)

    version_pdf = _pdf(client, auth_headers, document["id"], variant_id=variant["id"])
    working_pdf = _pdf(client, auth_headers, document["id"])
    assert "Working copy text." in _pdf_text(version_pdf)
    assert "Edited after saving" not in _pdf_text(version_pdf)
    assert "Edited after saving" in _pdf_text(working_pdf)

    docx = client.get(
        f"{PREFIX}/{document['id']}/artifacts/docx",
        params={"variant_id": variant["id"]},
        headers=auth_headers,
    )
    assert docx.status_code == 200
    assert "Working copy text." in "\n".join(
        p.text for p in Document(io.BytesIO(docx.content)).paragraphs
    )
    checks = _quality(client, auth_headers, document["id"], variant_id=variant["id"])
    assert checks["reads_back"]["passed"]
    # The working CV is exactly as the person left it.
    current = client.get(f"{PREFIX}/{document['id']}", headers=auth_headers).json()
    assert current["sections"][0]["entries"][0]["body"] == "Edited after saving the version."


def test_an_unknown_or_foreign_version_id_is_a_404(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."))
    response = client.get(
        f"{PREFIX}/{document['id']}/artifacts/pdf",
        params={"variant_id": "not-a-version"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_versions_can_be_renamed_and_deleted(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."))
    first = client.post(
        f"{PREFIX}/{document['id']}/variants", json={"name": "One"}, headers=auth_headers
    ).json()
    client.post(f"{PREFIX}/{document['id']}/variants", json={"name": "Two"}, headers=auth_headers)

    renamed = client.patch(
        f"{PREFIX}/{document['id']}/variants/{first['id']}",
        json={"name": "For Acme", "target_role": "Staff Engineer"},
        headers=auth_headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "For Acme" and renamed.json()["target_role"] == "Staff Engineer"
    clash = client.patch(
        f"{PREFIX}/{document['id']}/variants/{first['id']}",
        json={"name": "Two"},
        headers=auth_headers,
    )
    assert clash.status_code == 409

    deleted = client.delete(
        f"{PREFIX}/{document['id']}/variants/{first['id']}", headers=auth_headers
    )
    assert deleted.status_code == 204
    names = [
        v["name"] for v in client.get(f"{PREFIX}/{document['id']}", headers=auth_headers).json()["variants"]
    ]
    assert "For Acme" not in names and "Two" in names
    assert (
        client.delete(
            f"{PREFIX}/{document['id']}/variants/{first['id']}", headers=auth_headers
        ).status_code
        == 404
    )


def test_deleting_a_version_clears_it_from_applications_that_selected_it(
    client, auth_headers, db, test_user
):
    from app.models.workspace import Workspace  # noqa: PLC0415

    document = _create(client, auth_headers, _body_cv("Text."))
    variant = client.post(
        f"{PREFIX}/{document['id']}/variants", json={"name": "For Acme"}, headers=auth_headers
    ).json()
    workspace = Workspace(user_id=test_user.id, label="Acme", selected_cv_variant_id=variant["id"])
    db.add(workspace)
    db.commit()
    assert (
        client.delete(
            f"{PREFIX}/{document['id']}/variants/{variant['id']}", headers=auth_headers
        ).status_code
        == 204
    )
    db.refresh(workspace)
    assert workspace.selected_cv_variant_id is None


# ── d15 / d16: input validation ──


def test_nul_characters_are_rejected_as_422_not_500(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."))
    response = client.patch(
        f"{PREFIX}/{document['id']}", json={"name": "Bad\u0000name"}, headers=auth_headers
    )
    assert response.status_code == 422
    sections = _body_cv("Bad\u0000body")
    assert (
        client.post(PREFIX, json={"name": "x", "sections": sections}, headers=auth_headers).status_code
        == 422
    )


@pytest.mark.parametrize("blank", ["", "   ", "\n\t"])
def test_blank_names_titles_and_bodies_are_rejected(client, auth_headers, blank):
    document = _create(client, auth_headers, _body_cv("Text."))
    assert (
        client.patch(
            f"{PREFIX}/{document['id']}", json={"name": blank}, headers=auth_headers
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"{PREFIX}/{document['id']}/variants", json={"name": blank}, headers=auth_headers
        ).status_code
        == 422
    )
    for mutate in (
        lambda s: s[0].update(title=blank),
        lambda s: s[0]["entries"][0].update(body=blank),
    ):
        sections = _body_cv("Text.")
        mutate(sections)
        assert (
            client.patch(
                f"{PREFIX}/{document['id']}", json={"sections": sections}, headers=auth_headers
            ).status_code
            == 422
        )


def test_names_are_stored_trimmed(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."), name="  Padded name  ")
    assert document["name"] == "Padded name"


def test_duplicate_section_and_entry_ids_are_rejected(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."))
    twin_sections = [
        _section("summary", "Summary", 0, [_entry("a", 0, body="x")]),
        _section("summary", "Summary again", 1, [_entry("b", 0, body="y")]),
    ]
    assert (
        client.patch(
            f"{PREFIX}/{document['id']}", json={"sections": twin_sections}, headers=auth_headers
        ).status_code
        == 422
    )
    twin_entries = [_section("summary", "Summary", 0, [_entry("a", 0, body="x"), _entry("a", 1, body="y")])]
    assert (
        client.patch(
            f"{PREFIX}/{document['id']}", json={"sections": twin_entries}, headers=auth_headers
        ).status_code
        == 422
    )


# ── d17: separate export limits ──


def test_pdf_downloads_do_not_use_up_the_docx_limit(client, auth_headers):
    document = _create(client, auth_headers, _body_cv("Text."))
    for _ in range(10):
        assert client.get(f"{PREFIX}/{document['id']}/artifacts/pdf", headers=auth_headers).status_code == 200
    assert client.get(f"{PREFIX}/{document['id']}/artifacts/pdf", headers=auth_headers).status_code == 429
    assert client.get(f"{PREFIX}/{document['id']}/artifacts/docx", headers=auth_headers).status_code == 200


# ── d21: replays are 200 ──


def test_replaying_an_import_accept_returns_200_with_the_same_document(client, auth_headers):
    proposal = client.post(
        f"{PREFIX}/import/proposals",
        files={"file": ("cv.txt", io.BytesIO(IMPORTED.encode()), "text/plain")},
        headers=auth_headers,
    ).json()
    first = client.post(f"{PREFIX}/import/accept", json=proposal, headers=auth_headers)
    replay = client.post(f"{PREFIX}/import/accept", json=proposal, headers=auth_headers)
    assert first.status_code == 201
    assert replay.status_code == 200 and replay.json()["id"] == first.json()["id"]


def test_replaying_a_tailoring_apply_returns_200_with_the_same_version(
    client, auth_headers, test_user
):
    document = _create(client, auth_headers, _body_cv("Platform work."))
    change = {
        "id": "c1",
        "section_id": "s-summary",
        "entry_id": "a",
        "before": "Platform work.",
        "after": "Reliable platform work.",
        "job_requirement": "Reliability",
        "evidence_item_ids": [],
        "support": "document",
    }
    payload = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "b5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Tailored",
            "job_title": "Platform Engineer",
            "changes": [change],
            "decisions": [{"change_id": "c1", "action": "accept"}],
        },
    )
    first = client.post(f"{PREFIX}/{document['id']}/tailoring/apply", json=payload, headers=auth_headers)
    replay = client.post(f"{PREFIX}/{document['id']}/tailoring/apply", json=payload, headers=auth_headers)
    assert first.status_code == 201
    assert replay.status_code == 200 and replay.json()["id"] == first.json()["id"]


# ── d14: the DOCX is an A4 document with real headings ──


def test_docx_is_a4_with_heading_styles(client, auth_headers):
    document = _create(client, auth_headers, mid_cv_sections())
    response = client.get(f"{PREFIX}/{document['id']}/artifacts/docx", headers=auth_headers)
    parsed = Document(io.BytesIO(response.content))
    section = parsed.sections[0]
    assert abs(section.page_width - Mm(210)) < Mm(1)
    assert abs(section.page_height - Mm(297)) < Mm(1)
    headings = [p.text for p in parsed.paragraphs if p.style.name.startswith("Heading")]
    assert headings == ["Summary", "Experience", "Skills", "Education"]
