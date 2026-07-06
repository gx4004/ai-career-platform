import io
import zipfile

import pytest

from app.services import cv_upload
from app.services.cv_upload import CvUploadRejected, read_validated_cv_upload


class ChunkedUpload:
    def __init__(
        self,
        chunks: list[bytes],
        *,
        filename: str = "resume.pdf",
        content_type: str = "application/pdf",
    ):
        self.filename = filename
        self.content_type = content_type
        self._chunks = iter(chunks)
        self.read_sizes: list[int] = []

    async def read(self, size: int) -> bytes:
        self.read_sizes.append(size)
        return next(self._chunks, b"")


def _docx_bytes(entries: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return output.getvalue()


def _minimal_docx(**extra_entries: bytes) -> bytes:
    return _docx_bytes(
        {
            "[Content_Types].xml": b"<Types/>",
            "word/document.xml": b"<document/>",
            **extra_entries,
        }
    )


def _mark_first_zip_entry_encrypted(content: bytes) -> bytes:
    encrypted = bytearray(content)
    encrypted[6] |= 0x1
    central_header = encrypted.find(b"PK\x01\x02")
    assert central_header >= 0
    encrypted[central_header + 8] |= 0x1
    return bytes(encrypted)


async def test_upload_size_is_enforced_while_chunks_are_read(monkeypatch):
    monkeypatch.setattr(cv_upload, "MAX_CV_SIZE", 5)
    upload = ChunkedUpload([b"%PDF-", b"x", b"unread"])

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 413
    assert len(upload.read_sizes) == 2
    assert upload.read_sizes == [cv_upload.READ_CHUNK_SIZE] * 2


def test_product_upload_limit_remains_ten_megabytes():
    assert cv_upload.MAX_CV_SIZE == 10 * 1024 * 1024


async def test_docx_requires_expected_package_members():
    upload = ChunkedUpload(
        [_docx_bytes({"word/other.xml": b"<other/>"})],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 400


async def test_docx_rejects_unsafe_paths():
    upload = ChunkedUpload(
        [_minimal_docx(**{"../escape.txt": b"escape"})],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 400


async def test_docx_rejects_excessive_file_count(monkeypatch):
    monkeypatch.setattr(cv_upload, "MAX_DOCX_FILES", 2)
    upload = ChunkedUpload(
        [_minimal_docx(**{"docProps/core.xml": b"<core/>"})],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 413


async def test_docx_rejects_excessive_expansion(monkeypatch):
    monkeypatch.setattr(cv_upload, "MAX_DOCX_EXPANDED_SIZE", 32)
    upload = ChunkedUpload(
        [_minimal_docx(**{"word/media/image.bin": b"x" * 64})],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 413


async def test_docx_rejects_suspicious_compression_ratio(monkeypatch):
    monkeypatch.setattr(cv_upload, "MAX_DOCX_COMPRESSION_RATIO", 5)
    upload = ChunkedUpload(
        [_minimal_docx(**{"word/media/repeated.bin": b"x" * 4_096})],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 413


async def test_docx_rejects_encrypted_members():
    upload = ChunkedUpload(
        [_mark_first_zip_entry_encrypted(_minimal_docx())],
        filename="resume.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    with pytest.raises(CvUploadRejected) as exc_info:
        await read_validated_cv_upload(upload)

    assert exc_info.value.status_code == 400


async def test_valid_docx_boundary_returns_immutable_validated_upload():
    content = _minimal_docx()
    upload = ChunkedUpload(
        [content],
        filename="Resume.DOCX",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    validated = await read_validated_cv_upload(upload)

    assert validated.content == content
    assert validated.filename == "Resume.DOCX"
    assert validated.extension == "docx"
