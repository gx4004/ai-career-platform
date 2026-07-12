import multiprocessing
import os
import sys
import time

import pytest

from app.services import cv_parser_process
from app.services.cv_parser_process import (
    CvParserProcessRejected,
    _apply_resource_limits,
    _parse_import_worker,
    parse_cv_import_isolated,
    parse_cv_isolated,
)


def _successful_worker(sender, content, filename, extension):
    sender.send(
        (
            "ok",
            {
                "filename": filename,
                "extracted_text": content.decode(),
                "chars_count": len(content),
                "warnings": [],
            },
        )
    )
    sender.close()


def _sleeping_worker(sender, content, filename, extension):
    time.sleep(1)
    sender.close()


def _rejecting_worker(sender, content, filename, extension):
    sender.send(("error", None))
    sender.close()


def _crashing_worker(sender, content, filename, extension):
    os._exit(1)


class _TrackedConnection:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class _StartFailureProcess:
    def start(self):
        raise OSError("spawn unavailable")


class _StartFailureContext:
    def __init__(self):
        self.receiver = _TrackedConnection()
        self.sender = _TrackedConnection()

    def Pipe(self, duplex):
        assert duplex is False
        return self.receiver, self.sender

    def Process(self, **kwargs):
        return _StartFailureProcess()


async def test_isolated_parser_returns_validated_public_response():
    result = await parse_cv_isolated(
        b"resume text",
        "resume.pdf",
        "pdf",
        _worker=_successful_worker,
        _context=multiprocessing.get_context("spawn"),
    )

    assert result.filename == "resume.pdf"
    assert result.extracted_text == "resume text"
    assert result.chars_count == 11


async def test_isolated_parser_terminates_worker_at_wall_clock_timeout():
    started = time.monotonic()

    with pytest.raises(CvParserProcessRejected):
        await parse_cv_isolated(
            b"content",
            "resume.pdf",
            "pdf",
            timeout_seconds=0.05,
            _worker=_sleeping_worker,
            _context=multiprocessing.get_context("spawn"),
        )

    assert time.monotonic() - started < 0.5


async def test_isolated_import_uses_the_same_wall_clock_timeout():
    with pytest.raises(CvParserProcessRejected):
        await parse_cv_import_isolated(
            b"Summary\nSynthetic content",
            "resume.txt",
            "txt",
            timeout_seconds=0.05,
            _worker=_sleeping_worker,
            _context=multiprocessing.get_context("spawn"),
        )


def test_import_worker_applies_resource_limits_before_structuring(monkeypatch):
    calls = []

    class Sender:
        def send(self, value):
            calls.append(value)

        def close(self):
            calls.append("closed")

    monkeypatch.setattr(cv_parser_process, "_apply_resource_limits", lambda: calls.append("limits"))
    _parse_import_worker(Sender(), b"Skills\nPython", "resume.txt", "txt")

    assert calls[0] == "limits"
    assert calls[1][0] == "ok"
    assert calls[2] == "closed"


async def test_isolated_parser_maps_worker_failure_to_generic_rejection():
    with pytest.raises(CvParserProcessRejected):
        await parse_cv_isolated(
            b"content",
            "resume.pdf",
            "pdf",
            _worker=_rejecting_worker,
            _context=multiprocessing.get_context("spawn"),
        )


async def test_isolated_parser_cleans_pipes_when_process_start_fails():
    context = _StartFailureContext()

    with pytest.raises(CvParserProcessRejected):
        await parse_cv_isolated(
            b"content",
            "resume.pdf",
            "pdf",
            _context=context,
        )

    assert context.receiver.closed is True
    assert context.sender.closed is True


async def test_isolated_parser_maps_spawned_worker_crash_to_rejection():
    with pytest.raises(CvParserProcessRejected):
        await parse_cv_isolated(
            b"content",
            "resume.pdf",
            "pdf",
            _worker=_crashing_worker,
            _context=multiprocessing.get_context("spawn"),
        )


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="Unix resource limits are unavailable on Windows",
)
def test_linux_worker_sets_cpu_and_memory_limits(monkeypatch):
    import resource

    calls: list[tuple[int, tuple[int, int]]] = []
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setattr(resource, "setrlimit", lambda kind, limits: calls.append((kind, limits)))

    _apply_resource_limits()

    assert (
        resource.RLIMIT_CPU,
        (
            cv_parser_process.PARSER_CPU_LIMIT_SECONDS,
            cv_parser_process.PARSER_CPU_LIMIT_SECONDS + 1,
        ),
    ) in calls
    assert (
        resource.RLIMIT_AS,
        (
            cv_parser_process.PARSER_MEMORY_LIMIT_BYTES,
            cv_parser_process.PARSER_MEMORY_LIMIT_BYTES,
        ),
    ) in calls


def test_windows_worker_skips_unavailable_unix_resource_module(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")

    _apply_resource_limits()
