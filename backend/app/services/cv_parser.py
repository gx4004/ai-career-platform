from app.schemas.tools import ParsedCvResponse


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
        pages = [page.get_text() for page in doc]
    finally:
        doc.close()
    return "\n".join(pages)


def _extract_docx(content: bytes) -> str:
    import io

    from docx import Document

    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs)
