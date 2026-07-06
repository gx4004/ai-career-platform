from app.schemas.tools import ParsedCvResponse

MAX_PDF_PAGES = 100
MAX_EXTRACTED_CHARS = 2_000_000


class CvParserRejected(Exception):
    pass


def parse_cv(content: bytes, filename: str, ext: str) -> ParsedCvResponse:
    warnings: list[str] = []

    if ext == "pdf":
        text = _extract_pdf(content)
    elif ext == "docx":
        text = _extract_docx(content)
    else:
        raise ValueError(f"Unsupported format: {ext}")

    if not text.strip():
        warnings.append("No text could be extracted from this file")

    return ParsedCvResponse(
        filename=filename,
        extracted_text=text,
        chars_count=len(text),
        warnings=warnings,
    )


def _extract_pdf(content: bytes) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=content, filetype="pdf")
    try:
        if doc.needs_pass:
            raise CvParserRejected("Encrypted PDFs are not supported")
        if doc.page_count > MAX_PDF_PAGES:
            raise CvParserRejected("PDF page limit exceeded")
        pages = _bounded_text_parts(page.get_text() for page in doc)
    finally:
        doc.close()
    return "\n".join(pages)


def _extract_docx(content: bytes) -> str:
    import io

    from docx import Document

    with io.BytesIO(content) as buffer:
        doc = Document(buffer)
        paragraphs = _bounded_text_parts(p.text for p in doc.paragraphs)
    return "\n".join(paragraphs)


def _bounded_text_parts(parts) -> list[str]:
    bounded: list[str] = []
    chars_count = 0
    for part in parts:
        chars_count += len(part)
        if bounded:
            chars_count += 1
        if chars_count > MAX_EXTRACTED_CHARS:
            raise CvParserRejected("Extracted text limit exceeded")
        bounded.append(part)
    return bounded
