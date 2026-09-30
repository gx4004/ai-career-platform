import os
import time

import pytest

from app.services.cv_parser_process import (
    CvParserProcessRejected,
    parse_cv_import_isolated,
    parse_cv_isolated,
)


def _sleeping_worker(sender, content, filename, extension):
    time.sleep(1)
    sender.close()


def _crashing_worker(sender, content, filename, extension):
    os._exit(1)


async def test_valid_file_parses_in_an_isolated_worker():
    proposal = await parse_cv_import_isolated(b"Skills\nPython, SQL", "resume.txt", "txt")

    assert [section.kind for section in proposal.sections] == ["skills"]
    assert proposal.sections[0].entries[0].body == "Python, SQL"


async def test_worker_is_killed_at_the_wall_clock_timeout():
    started = time.monotonic()

    with pytest.raises(CvParserProcessRejected, match="timed out"):
        await parse_cv_isolated(
            b"content", "resume.pdf", "pdf", timeout_seconds=0.05, _worker=_sleeping_worker
        )

    assert time.monotonic() - started < 0.5


@pytest.mark.parametrize("worker", [_crashing_worker, None])
async def test_crashed_worker_or_unreadable_file_is_a_generic_rejection(worker):
    # None runs the real worker on bytes that are not a PDF.
    with pytest.raises(CvParserProcessRejected):
        await parse_cv_isolated(b"not a pdf", "resume.pdf", "pdf", _worker=worker)
