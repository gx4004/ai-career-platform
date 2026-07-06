from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

from fastapi import UploadFile

MAX_CV_SIZE = 10 * 1024 * 1024
READ_CHUNK_SIZE = 64 * 1024
MAX_DOCX_FILES = 2_000
MAX_DOCX_EXPANDED_SIZE = 50 * 1024 * 1024
MAX_DOCX_ENTRY_SIZE = 10 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100

GENERIC_INVALID_FILE_DETAIL = "The uploaded file could not be safely parsed."
GENERIC_LIMIT_DETAIL = "The uploaded file exceeds safety limits."

_PDF_MIME = "application/pdf"
_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
_PDF_MAGIC = b"%PDF-"
_DOCX_MAGIC = b"PK\x03\x04"


class CvUploadRejected(Exception):
    def __init__(self, *, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ValidatedCvUpload:
    content: bytes
    filename: str
    extension: str


async def read_validated_cv_upload(file: UploadFile) -> ValidatedCvUpload:
    filename = file.filename or ""
    extension = _extension(filename)
    expected_mime = {"pdf": _PDF_MIME, "docx": _DOCX_MIME}.get(extension)
    if expected_mime is None or file.content_type != expected_mime:
        raise _invalid_file()

    content = await _read_bounded(file)
    expected_magic = _PDF_MAGIC if extension == "pdf" else _DOCX_MAGIC
    if not content.startswith(expected_magic):
        raise _invalid_file()
    if extension == "docx":
        _validate_docx_container(content)

    return ValidatedCvUpload(
        content=content,
        filename=filename,
        extension=extension,
    )


def _extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


async def _read_bounded(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(READ_CHUNK_SIZE):
        total += len(chunk)
        if total > MAX_CV_SIZE:
            raise CvUploadRejected(
                status_code=413,
                detail=GENERIC_LIMIT_DETAIL,
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _validate_docx_container(content: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if len(entries) > MAX_DOCX_FILES:
                raise _limit_exceeded()
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise _invalid_file()

            expanded_total = 0
            for entry in entries:
                if entry.flag_bits & 0x1:
                    raise _invalid_file()
                if _unsafe_archive_path(entry.filename):
                    raise _invalid_file()
                if entry.file_size > MAX_DOCX_ENTRY_SIZE:
                    raise _limit_exceeded()
                expanded_total += entry.file_size
                if expanded_total > MAX_DOCX_EXPANDED_SIZE:
                    raise _limit_exceeded()
                if (
                    entry.file_size > 0
                    and entry.compress_size > 0
                    and entry.file_size / entry.compress_size
                    > MAX_DOCX_COMPRESSION_RATIO
                ):
                    raise _limit_exceeded()
    except CvUploadRejected:
        raise
    except (OSError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise _invalid_file() from exc


def _unsafe_archive_path(filename: str) -> bool:
    normalized = filename.replace("\\", "/")
    return normalized.startswith("/") or ".." in normalized.split("/")


def _invalid_file() -> CvUploadRejected:
    return CvUploadRejected(status_code=400, detail=GENERIC_INVALID_FILE_DETAIL)


def _limit_exceeded() -> CvUploadRejected:
    return CvUploadRejected(status_code=413, detail=GENERIC_LIMIT_DETAIL)
