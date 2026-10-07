"""Unit tests for CV parsing (pdf / docx extraction)."""

from unittest.mock import MagicMock, patch

import pytest

from app.services import cv_parser
from app.services.cv_parser import CvParserRejected, parse_cv

# ---------- PDF extraction ----------

def test_pdf_extraction():
    fake_page = MagicMock()
    fake_page.get_text.return_value = "John Doe\nSoftware Engineer"

    fake_doc = MagicMock()
    fake_doc.needs_pass = False
    fake_doc.page_count = 1
    fake_doc.__iter__ = lambda self: iter([fake_page])

    with patch("fitz.open", return_value=fake_doc) as mock_open:
        result = parse_cv(b"fake-pdf-bytes", "resume.pdf", "pdf")

    mock_open.assert_called_once_with(stream=b"fake-pdf-bytes", filetype="pdf")
    fake_doc.close.assert_called_once()
    assert "John Doe" in result.extracted_text
    assert result.filename == "resume.pdf"
    assert result.chars_count > 0
    assert result.warnings == []


def test_pdf_empty_text_warns():
    fake_page = MagicMock()
    fake_page.get_text.return_value = ""

    fake_doc = MagicMock()
    fake_doc.needs_pass = False
    fake_doc.page_count = 1
    fake_doc.__iter__ = lambda self: iter([fake_page])

    with patch("fitz.open", return_value=fake_doc):
        result = parse_cv(b"empty-pdf", "empty.pdf", "pdf")

    assert any("No text" in w for w in result.warnings)


def test_pdf_multi_page():
    pages = []
    for text in ["Page 1 content", "Page 2 content"]:
        p = MagicMock()
        p.get_text.return_value = text
        pages.append(p)

    fake_doc = MagicMock()
    fake_doc.needs_pass = False
    fake_doc.page_count = 2
    fake_doc.__iter__ = lambda self: iter(pages)

    with patch("fitz.open", return_value=fake_doc):
        result = parse_cv(b"multi-page", "multi.pdf", "pdf")

    assert "Page 1 content" in result.extracted_text
    assert "Page 2 content" in result.extracted_text


def test_pdf_rejects_encrypted_documents():
    fake_doc = MagicMock()
    fake_doc.needs_pass = True

    with patch("fitz.open", return_value=fake_doc):
        with pytest.raises(CvParserRejected):
            parse_cv(b"encrypted-pdf", "resume.pdf", "pdf")

    fake_doc.close.assert_called_once()


def test_pdf_rejects_excessive_page_count(monkeypatch):
    monkeypatch.setattr(cv_parser, "MAX_PDF_PAGES", 2)
    fake_doc = MagicMock()
    fake_doc.needs_pass = False
    fake_doc.page_count = 3

    with patch("fitz.open", return_value=fake_doc):
        with pytest.raises(CvParserRejected):
            parse_cv(b"many-pages", "resume.pdf", "pdf")

    fake_doc.close.assert_called_once()


def test_pdf_rejects_excessive_extracted_text(monkeypatch):
    monkeypatch.setattr(cv_parser, "MAX_EXTRACTED_CHARS", 5)
    fake_page = MagicMock()
    fake_page.get_text.return_value = "too much text"
    fake_doc = MagicMock()
    fake_doc.needs_pass = False
    fake_doc.page_count = 1
    fake_doc.__iter__ = lambda self: iter([fake_page])

    with patch("fitz.open", return_value=fake_doc):
        with pytest.raises(CvParserRejected):
            parse_cv(b"large-text", "resume.pdf", "pdf")

    fake_doc.close.assert_called_once()


# ---------- DOCX extraction ----------

def test_docx_extraction():
    fake_para_1 = MagicMock()
    fake_para_1.text = "Jane Smith"
    fake_para_2 = MagicMock()
    fake_para_2.text = "Data Analyst"

    fake_doc = MagicMock()
    fake_doc.paragraphs = [fake_para_1, fake_para_2]

    with patch("docx.Document", return_value=fake_doc):
        result = parse_cv(b"fake-docx-bytes", "resume.docx", "docx")

    assert "Jane Smith" in result.extracted_text
    assert "Data Analyst" in result.extracted_text
    assert result.filename == "resume.docx"
    assert result.warnings == []


def test_docx_empty_text_warns():
    fake_doc = MagicMock()
    fake_doc.paragraphs = []

    with patch("docx.Document", return_value=fake_doc):
        result = parse_cv(b"empty-docx", "empty.docx", "docx")

    assert any("No text" in w for w in result.warnings)


def test_docx_rejects_excessive_extracted_text(monkeypatch):
    monkeypatch.setattr(cv_parser, "MAX_EXTRACTED_CHARS", 5)
    fake_para = MagicMock()
    fake_para.text = "too much text"
    fake_doc = MagicMock()
    fake_doc.paragraphs = [fake_para]

    with patch("docx.Document", return_value=fake_doc):
        with pytest.raises(CvParserRejected):
            parse_cv(b"large-docx", "resume.docx", "docx")


# ---------- Unsupported format ----------

def test_unsupported_format_raises():
    with pytest.raises(ValueError, match="Unsupported format: txt"):
        parse_cv(b"plain text", "resume.txt", "txt")


def test_unsupported_format_xlsx():
    with pytest.raises(ValueError, match="Unsupported format: xlsx"):
        parse_cv(b"spreadsheet", "resume.xlsx", "xlsx")


# ---------- pathological lines (ReDoS) ----------

import time  # noqa: E402

_PATHOLOGICAL = {
    "spaces": "a" + " " * 3000 + "x",
    "title_gap_org": "Senior Engineer" + " " * 500 + "Acme Corp",
    "dashes": "-" * 3000,
    "spaced_dashes": "a " + "- " * 1500 + "x",
    "tabs": "Engineer" + "\t" * 3000 + "Acme",
    "spaces_and_tabs": "Engineer" + " \t" * 1500 + "2020",
    "commas": ", " * 1500 + "2020",
    "short_gap": "Senior Engineer" + " " * 150 + "Acme Corp",
}
_CONTEXTS = {
    "header": "{line}\n{line}\nExperience\nEngineer\n- x",
    "role_line": "Experience\n{line}\n- did a thing",
    "next_line": "Experience\nEngineer\n{line}\n- did a thing",
    "title_block": "Experience\nEngineer\nAcme\n{line}\n- x",
    "dates_first": "Experience\n2020 – 2022\n{line}\n{line}\n- x",
    "body": "Projects\n{line}\n{line}",
}


def _elapsed(call) -> float:
    started = time.perf_counter()
    call()
    return time.perf_counter() - started


@pytest.mark.parametrize("context", sorted(_CONTEXTS))
@pytest.mark.parametrize("name", sorted(_PATHOLOGICAL))
def test_a_pathological_line_is_parsed_quickly(name, context):
    text = _CONTEXTS[context].format(line=_PATHOLOGICAL[name])
    assert _elapsed(lambda: cv_parser._structure_text(text, "cv.txt", [])) < 0.1
    # The PDF read-back (validate_artifact) runs this in the request process.
    assert _elapsed(lambda: cv_parser.split_sections(cv_parser.lines_from_text(text), keep_empty=True)) < 0.1


@pytest.mark.parametrize("name", sorted(_PATHOLOGICAL))
def test_date_analysis_of_a_pathological_line_is_quick(name):
    line = _PATHOLOGICAL[name]
    assert _elapsed(lambda: cv_parser._analyse(line)) < 0.1
    assert _elapsed(lambda: cv_parser._analyse(line[:399])) < 0.1
    assert _elapsed(lambda: cv_parser.title_key(line)) < 0.1


def test_a_line_longer_than_the_cap_is_plain_text():
    line = "Engineer " * 50 + "Jan 2020 – Present"
    assert cv_parser._analyse(line) == (line, None, None)


def test_a_column_gap_reads_as_a_separator():
    proposal = cv_parser._structure_text(
        "Experience\nSenior Engineer      Acme Corp      2020 – 2022\n- Built the thing.", "cv.txt", []
    )
    entry = proposal.sections[0].entries[0]
    assert (entry.heading, entry.subheading, entry.start_date, entry.end_date) == (
        "Senior Engineer", "Acme Corp", "2020", "2022",
    )
