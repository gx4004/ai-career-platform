"""Importer quality (#470): company, location and dates read apart, Cyrillic CVs, no empty sections.

``tests/fixtures/cv_import/`` holds the corpus (see ``tests/cv_import_corpus.py``); the round-trip
tests export our own PDF and DOCX for every available template and import them again.
"""

from __future__ import annotations

import collections
import json
import unicodedata
from pathlib import Path

import fitz
import pytest

from app.schemas.cv_documents import CvStyle
from app.services.cv_html import available_template_ids
from app.services.cv_parser import parse_cv_import, split_sections, lines_from_text
from app.services.cv_rendering import build_render_model, render_docx, render_pdf
from tests import cv_fixtures

FIXTURES = Path(__file__).parent / "fixtures" / "cv_import"
EXPECTED = json.loads((FIXTURES / "expected.json").read_text())
FILES = sorted(path for path in FIXTURES.iterdir() if path.suffix in {".docx", ".pdf"})
MAYA = Path(__file__).resolve().parents[2] / "test-cv" / "Maya-Lindqvist-CV.docx"
FIELDS = ("heading", "subheading", "location", "start_date", "end_date")


def _nfc(value):
    return unicodedata.normalize("NFC", value).strip() or None if isinstance(value, str) else value


def _entries_by_kind(proposal):
    grouped = collections.defaultdict(list)
    for section in proposal.sections:
        grouped[section.kind].extend(section.entries)
    return grouped


def _assert_matches(proposal, expected_sections):
    assert sorted(s.kind for s in proposal.sections) == sorted(s["kind"] for s in expected_sections)
    assert all(section.entries for section in proposal.sections), "an empty section was imported"
    got = _entries_by_kind(proposal)
    for expected in expected_sections:
        for index, want in enumerate(expected["entries"]):
            entry = got[expected["kind"]][index]
            if "body" in want:
                assert entry.body
                continue
            for field in FIELDS:
                assert _nfc(getattr(entry, field)) == _nfc(want[field]), (expected["kind"], index, field)
            assert list(entry.bullets) == want["bullets"], (expected["kind"], index, "bullets")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_corpus_file_imports_with_company_location_and_dates_apart(path):
    name = path.name.split(".")[0]
    proposal = parse_cv_import(path.read_bytes(), path.name, path.suffix[1:])
    _assert_matches(proposal, EXPECTED[name])


@pytest.mark.skipif(not MAYA.exists(), reason="owner fixture not present")
def test_maya_docx_imports_clean():
    proposal = parse_cv_import(MAYA.read_bytes(), MAYA.name, "docx")
    header = proposal.header
    assert (header.name, header.headline, header.location) == (
        "Maya Lindqvist", "Product-minded Frontend Engineer", "Amsterdam, Netherlands")
    assert header.email == "maya.lindqvist@example.com" and header.phone == "+31 6 1234 5678"
    assert [s.kind for s in proposal.sections] == [
        "summary", "experience", "projects", "education", "skills", "custom"]
    jobs = proposal.sections[1].entries
    assert [(j.heading, j.subheading, j.location, j.start_date, j.end_date, len(j.bullets)) for j in jobs] == [
        ("Frontend Engineer", "Tulip Pay", "Amsterdam", "Mar 2022", "Present", 4),
        ("Junior Frontend Developer", "Northwind Travel", "Rotterdam", "Aug 2019", "Feb 2022", 3),
    ]
    education = proposal.sections[3].entries[0]
    assert (education.heading, education.subheading, education.start_date, education.end_date) == (
        "BSc Information Science", "University of Amsterdam", "2015", "2019")
    assert education.body.endswith("Thesis on accessible data visualisation")


@pytest.mark.parametrize(
    "line, start, end",
    [
        ("Engineer, Acme (Mar 2022 – Present)", "Mar 2022", "Present"),
        ("Engineer, Acme  03/2022 - now", "03/2022", "now"),
        ("Engineer, Acme 2019–2022", "2019", "2022"),
        ("Engineer, Acme Jan 2020 to Dec 2021", "Jan 2020", "Dec 2021"),
        ("Engineer, Acme\tSeptember 2017 – June 2019", "September 2017", "June 2019"),
        ("Инженер, Acme мар 2022 – наст. время", "мар 2022", "наст. время"),
        ("Инженер, Acme март 2022 — настоящее время", "март 2022", "настоящее время"),
        ("Інженер, Acme з січня 2020 по теперішній час", "січня 2020", "теперішній час"),
        ("Инженер, Яндекс с марта 2019 по настоящее время", "марта 2019", "настоящее время"),
        ("Engineer, Acme 2020 – 2021 г.", "2020", "2021 г."),
    ],
)
def test_dates_split_into_start_and_end_keeping_the_text(line, start, end):
    text = f"Name Person\nname@example.com\n\nExperience\n{line}\n- Did things.\n"
    entry = parse_cv_import(text.encode(), "cv.txt", "txt").sections[0].entries[0]
    assert (entry.start_date, entry.end_date) == (start, end)
    assert entry.subheading in {"Acme", "Яндекс"} and entry.heading


@pytest.mark.parametrize(
    "title, kind",
    [
        ("Work History", "experience"), ("Professional Experience", "experience"),
        ("Профессиональный опыт", "experience"), ("ОПЫТ РАБОТЫ", "experience"),
        ("Образование", "education"), ("Навыки", "skills"), ("Ключевые навыки", "skills"),
        ("О себе", "summary"), ("Проекты", "projects"), ("Сертификаты", "certifications"),
        ("Языки", "custom"), ("Досвід роботи", "experience"), ("Освіта", "education"),
    ],
)
def test_section_names_map_to_kinds_including_cyrillic(title, kind):
    _, sections = split_sections(lines_from_text(f"{title}\nsome content\n"))
    assert [section[0] for section in sections] == [kind]


def test_headings_without_content_are_never_imported():
    text = "Name Person\nname@example.com\n\nSummary\n\nExperience\nEngineer, Acme (2020 - 2021)\n- Did.\n\nEducation\n\nSkills\n"
    proposal = parse_cv_import(text.encode(), "cv.txt", "txt")
    assert [s.kind for s in proposal.sections] == ["experience"]


@pytest.mark.parametrize("glyph", ["•", "-", "–", "▪", "●", "➢", ""])
def test_bullet_glyphs_all_read_as_bullets(glyph):
    text = f"Name Person\nname@example.com\n\nExperience\nEngineer, Acme (2020 - 2021)\n{glyph} First point.\n{glyph} Second point.\n"
    entry = parse_cv_import(text.encode(), "cv.txt", "txt").sections[0].entries[0]
    assert entry.bullets == ["First point.", "Second point."]


def test_one_line_header_and_no_summary():
    text = ("Maya Lindqvist | Amsterdam | maya@example.com | +31 6 1234 5678\n\n"
            "Experience\nEngineer, Acme (2020 - 2021)\n- Did.\n")
    proposal = parse_cv_import(text.encode(), "cv.txt", "txt")
    assert (proposal.header.name, proposal.header.email) == ("Maya Lindqvist", "maya@example.com")
    assert proposal.header.location == "Amsterdam"
    assert [s.kind for s in proposal.sections] == ["experience"]


def test_undated_entry_with_company_and_dates_only():
    text = "Name Person\nname@example.com\n\nExperience\nAcme Media  2019 - 2022\nGlobex News  Jan 2016 - Dec 2018\n"
    entries = parse_cv_import(text.encode(), "cv.txt", "txt").sections[0].entries
    assert [(e.heading, e.start_date, e.end_date) for e in entries] == [
        ("Acme Media", "2019", "2022"), ("Globex News", "Jan 2016", "Dec 2018")]


# -- round trip: our own exports come back with the same structure -------------------------

FLOW = {**cv_fixtures.ALL, **cv_fixtures.EDGE}
STRUCTURED = ("experience", "education", "projects")


def _source(cv):
    return [(s["kind"], s["entries"]) for s in cv.sections if s["visible"] and s["entries"]]


def _check_round_trip(cv, proposal, fmt):
    expected = _source(cv)
    assert sorted(k for k, _ in expected) == sorted(s.kind for s in proposal.sections), fmt
    assert all(s.entries for s in proposal.sections)
    got = _entries_by_kind(proposal)
    for kind, entries in expected:
        if kind not in STRUCTURED:
            continue
        for index, want in enumerate(entries):
            entry = got[kind][index]
            for field in FIELDS:
                assert _nfc(getattr(entry, field)) == _nfc(want.get(field)), (fmt, kind, index, field)
            assert list(entry.bullets) == list(want.get("bullets") or []), (fmt, kind, index)
    header = proposal.header
    assert header.name == cv.header["name"]
    if cv.header.get("email"):
        assert header.email == cv.header["email"]


@pytest.mark.parametrize("template", available_template_ids())
@pytest.mark.parametrize("fixture", sorted(FLOW))
def test_exported_pdf_and_docx_import_back_to_the_same_structure(template, fixture):
    cv = FLOW[fixture]()
    model = build_render_model(cv, template, CvStyle())
    _check_round_trip(cv, parse_cv_import(render_pdf(model), "cv.pdf", "pdf"), f"{template} pdf")
    _check_round_trip(cv, parse_cv_import(render_docx(model), "cv.docx", "docx"), f"{template} docx")


@pytest.mark.parametrize("template", available_template_ids())
def test_exports_never_print_an_empty_section(template):
    from docx import Document
    import io

    cv = cv_fixtures.maya()
    cv.sections.append(cv_fixtures.section("empty1", "custom", "Hobbies Heading Nobody Filled", 9, []))
    cv.sections.append(cv_fixtures.section("empty2", "projects", "Publications Heading Empty", 10, []))
    model = build_render_model(cv, template, CvStyle())
    with fitz.open(stream=render_pdf(model), filetype="pdf") as pdf:
        text = "\n".join(page.get_text() for page in pdf)
    assert "Hobbies Heading Nobody Filled" not in text and "Publications Heading Empty" not in text
    docx_text = "\n".join(p.text for p in Document(io.BytesIO(render_docx(model))).paragraphs)
    assert "Hobbies Heading Nobody Filled" not in docx_text and "Publications Heading Empty" not in docx_text
