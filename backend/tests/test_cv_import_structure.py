"""Imported CVs keep their structure: one entry per role with real bullets,
Word headings are recognised, and the name/contact block becomes the header
instead of Summary entries or Evidence claims (B5)."""

import io

import fitz
from docx import Document

PREFIX = "/api/v1/cv-documents"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

CONTACT = "casey.morgan@example.com | +49 30 5550134 | Berlin, Germany | linkedin.com/in/caseymorgan"

TEXT_CV = f"""Casey Morgan
Backend Engineer
{CONTACT}

Summary
Platform engineer focused on reliable systems.

Professional Experience
Senior Backend Engineer, Northwind Labs (Mar 2021 - Present)
• Cut p95 latency by 38% across the ingestion API.
• Led 4 engineers through a database migration.
Backend Engineer – Acme Corp\tJan 2018 – Feb 2021
- Built the billing service.

Education
BSc Computer Science, University of Berlin (2013 - 2017)

Skills
Python
PostgreSQL
"""


def _propose(client, auth_headers, filename, content, mime):
    response = client.post(
        f"{PREFIX}/import/proposals",
        files={"file": (filename, io.BytesIO(content), mime)},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _by_kind(proposal):
    return {section["kind"]: section for section in proposal["sections"]}


def _assert_casey_structure(proposal):
    kinds = [section["kind"] for section in proposal["sections"]]
    assert kinds == ["summary", "experience", "education", "skills"]
    experience = _by_kind(proposal)["experience"]
    assert experience["title"] == "Professional Experience"
    roles = experience["entries"]
    assert len(roles) == 2
    first, second = roles
    assert (first["heading"], first["subheading"]) == ("Senior Backend Engineer", "Northwind Labs")
    assert (first["start_date"], first["end_date"]) == ("Mar 2021", "Present")
    assert first["bullets"] == [
        "Cut p95 latency by 38% across the ingestion API.",
        "Led 4 engineers through a database migration.",
    ]
    assert (second["heading"], second["subheading"]) == ("Backend Engineer", "Acme Corp")
    assert (second["start_date"], second["end_date"]) == ("Jan 2018", "Feb 2021")
    assert second["bullets"] == ["Built the billing service."]
    for role in roles:
        assert "•" not in role["body"] and not role["body"].startswith("-")
    education = _by_kind(proposal)["education"]["entries"]
    assert len(education) == 1
    assert (education[0]["heading"], education[0]["subheading"]) == (
        "BSc Computer Science",
        "University of Berlin",
    )
    assert [e["body"] for e in _by_kind(proposal)["skills"]["entries"]] == ["Python", "PostgreSQL"]


def _assert_header_not_content(proposal):
    header = proposal["header"]
    assert header["name"] == "Casey Morgan"
    assert header["headline"] == "Backend Engineer"
    assert header["email"] == "casey.morgan@example.com"
    assert header["phone"] == "+49 30 5550134"
    assert header["location"] == "Berlin, Germany"
    assert any("linkedin.com/in/caseymorgan" in link for link in header["links"])
    everything = [
        entry["body"] for section in proposal["sections"] for entry in section["entries"]
    ] + [
        str(entry["claim"]["content"])
        for section in proposal["sections"]
        for entry in section["entries"]
        if entry["claim"]
    ]
    for text in everything:
        assert "casey.morgan@example.com" not in text
        assert "Casey Morgan" not in text
        assert "5550134" not in text


def test_text_cv_imports_one_entry_per_role_with_bullets_and_a_header(client, auth_headers):
    proposal = _propose(client, auth_headers, "cv.txt", TEXT_CV.encode(), "text/plain")

    _assert_casey_structure(proposal)
    _assert_header_not_content(proposal)
    assert len(_by_kind(proposal)["summary"]["entries"]) == 1


def test_contact_line_is_never_staged_as_an_achievement(client, auth_headers):
    proposal = _propose(client, auth_headers, "cv.txt", TEXT_CV.encode(), "text/plain")

    claims = [
        entry["claim"]
        for section in proposal["sections"]
        for entry in section["entries"]
        if entry["claim"]
    ]
    assert claims, "reviewable claims are still staged"
    assert all("@" not in str(claim["content"]) for claim in claims)


def test_summary_heading_does_not_produce_a_second_summary_section(client, auth_headers):
    text = "Casey Morgan\nProfile\nBuilds reliable systems.\n\nSkills\nPython\n"
    proposal = _propose(client, auth_headers, "cv.txt", text.encode(), "text/plain")

    assert [section["kind"] for section in proposal["sections"]] == ["summary", "skills"]
    assert proposal["header"]["name"] == "Casey Morgan"


def test_docx_cv_uses_word_headings_tabs_and_list_styles(client, auth_headers):
    document = Document()
    document.add_heading("Casey Morgan", 0)
    document.add_paragraph("Backend Engineer")
    document.add_paragraph(CONTACT)
    document.add_heading("Summary", 1)
    document.add_paragraph("Platform engineer focused on reliable systems.")
    document.add_heading("Professional Experience", 1)
    document.add_paragraph("Senior Backend Engineer, Northwind Labs (Mar 2021 - Present)")
    document.add_paragraph("Cut p95 latency by 38% across the ingestion API.", style="List Bullet")
    document.add_paragraph(
        "Led 4 engineers through a database migration.", style="List Bullet"
    )
    document.add_paragraph("Backend Engineer – Acme Corp\tJan 2018 – Feb 2021")
    document.add_paragraph("Built the billing service.", style="List Bullet")
    document.add_heading("Education", 1)
    document.add_paragraph("BSc Computer Science, University of Berlin (2013 - 2017)")
    document.add_heading("Skills", 1)
    document.add_paragraph("Python")
    document.add_paragraph("PostgreSQL")
    buffer = io.BytesIO()
    document.save(buffer)

    proposal = _propose(client, auth_headers, "cv.docx", buffer.getvalue(), DOCX_MIME)

    _assert_casey_structure(proposal)
    _assert_header_not_content(proposal)


def test_docx_heading_style_names_a_section_even_when_the_title_is_unusual(client, auth_headers):
    document = Document()
    document.add_heading("Casey Morgan", 0)
    document.add_heading("Career History", 1)
    document.add_paragraph("Backend Engineer, Acme Corp (2018 - 2021)")
    document.add_paragraph("Built the billing service.", style="List Bullet")
    buffer = io.BytesIO()
    document.save(buffer)

    proposal = _propose(client, auth_headers, "cv.docx", buffer.getvalue(), DOCX_MIME)

    assert [section["kind"] for section in proposal["sections"]] == ["experience"]
    assert proposal["sections"][0]["entries"][0]["bullets"] == ["Built the billing service."]


def test_exported_pdf_reimports_as_the_same_single_role_with_bullets(client, auth_headers):
    created = client.post(
        PREFIX,
        json={
            "name": "Round trip",
            "header": {
                "name": "Casey Morgan",
                "headline": "Backend Engineer",
                "email": "casey.morgan@example.com",
                "location": "Berlin, Germany",
            },
            "sections": [
                {
                    "id": "exp",
                    "kind": "experience",
                    "title": "Experience",
                    "position": 0,
                    "entries": [
                        {
                            "id": "r1",
                            "evidence_item_id": None,
                            "body": "x",
                            "position": 0,
                            "heading": "Senior Backend Engineer",
                            "subheading": "Northwind Labs",
                            "start_date": "Mar 2021",
                            "end_date": "Present",
                            "bullets": [
                                "Cut p95 latency by 38% by redesigning the ingestion pipeline "
                                "and moving hot paths to a streaming design for all customers",
                                "Led 4 engineers through a database migration.",
                            ],
                        }
                    ],
                }
            ],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    pdf = client.get(f"{PREFIX}/{created.json()['id']}/artifacts/pdf", headers=auth_headers)
    assert pdf.status_code == 200

    proposal = _propose(client, auth_headers, "cv.pdf", pdf.content, "application/pdf")

    assert proposal["header"]["name"] == "Casey Morgan"
    assert [section["kind"] for section in proposal["sections"]] == ["experience"]
    (role,) = proposal["sections"][0]["entries"]
    assert (role["heading"], role["subheading"]) == ("Senior Backend Engineer", "Northwind Labs")
    assert (role["start_date"], role["end_date"]) == ("Mar 2021", "Present")
    assert len(role["bullets"]) == 2
    assert role["bullets"][0].endswith("for all customers")
    assert role["bullets"][1] == "Led 4 engineers through a database migration."


def test_accepted_import_stores_one_role_with_bullets_and_the_header(client, auth_headers):
    proposal = _propose(client, auth_headers, "cv.txt", TEXT_CV.encode(), "text/plain")

    response = client.post(f"{PREFIX}/import/accept", json=proposal, headers=auth_headers)

    assert response.status_code == 201, response.text
    document = response.json()
    assert document["header"]["name"] == "Casey Morgan"
    experience = next(s for s in document["sections"] if s["kind"] == "experience")
    assert len(experience["entries"]) == 2
    assert experience["entries"][0]["bullets"][0].startswith("Cut p95 latency")
    pdf = client.get(f"{PREFIX}/{document['id']}/artifacts/pdf", headers=auth_headers)
    text = "\n".join(page.get_text() for page in fitz.open(stream=pdf.content, filetype="pdf"))
    # The role is rendered once, as heading + bullets: the original sentence is gone.
    assert "(Mar 2021 - Present)" not in text
    assert text.count("Senior Backend Engineer") == 1
    assert "Casey Morgan" in text


def test_wrapped_pdf_style_bullets_are_rejoined_and_dates_may_sit_on_their_own_line(
    client, auth_headers
):
    text = (
        "Experience\n"
        "Staff Engineer — Globex\n"
        "Jan 2022 – Present\n"
        "• Redesigned the ingestion pipeline and moved hot paths to a streaming design\n"
        "for all customers\n"
        "• Mentored 6 engineers\n"
    )

    proposal = _propose(client, auth_headers, "cv.txt", text.encode(), "text/plain")

    (role,) = proposal["sections"][0]["entries"]
    assert (role["heading"], role["subheading"]) == ("Staff Engineer", "Globex")
    assert (role["start_date"], role["end_date"]) == ("Jan 2022", "Present")
    assert role["bullets"] == [
        "Redesigned the ingestion pipeline and moved hot paths to a streaming design for all customers",
        "Mentored 6 engineers",
    ]


def test_title_line_above_bullets_becomes_a_role_even_without_dates(client, auth_headers):
    text = "WORK EXPERIENCE\nSenior Engineer at Example Corp\n- Improved reliability by 20%.\n"

    proposal = _propose(client, auth_headers, "cv.txt", text.encode(), "text/plain")

    section = proposal["sections"][0]
    assert (section["kind"], section["title"]) == ("experience", "Work Experience")
    (role,) = section["entries"]
    assert (role["heading"], role["subheading"]) == ("Senior Engineer", "Example Corp")
    assert role["bullets"] == ["Improved reliability by 20%."]


def test_a_cv_without_a_name_block_has_an_empty_header(client, auth_headers):
    text = "Skills\nPython\nPostgreSQL\n"

    proposal = _propose(client, auth_headers, "cv.txt", text.encode(), "text/plain")

    assert proposal["header"]["name"] is None and proposal["header"]["links"] == []
    assert [s["kind"] for s in proposal["sections"]] == ["skills"]
