from __future__ import annotations

import asyncio
import math
import multiprocessing
import sys
from collections.abc import Callable
from multiprocessing.connection import Connection

from app.schemas.tools import ParsedCvResponse
from app.services.cv_parser import parse_cv

PARSER_TIMEOUT_SECONDS = 8.0
PARSER_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024
PARSER_CPU_LIMIT_SECONDS = 6

ParserWorker = Callable[[Connection, bytes, str, str], None]


class CvParserProcessRejected(Exception):
    pass


async def parse_cv_isolated(
    content: bytes,
    filename: str,
    extension: str,
    *,
    timeout_seconds: float = PARSER_TIMEOUT_SECONDS,
    _worker: ParserWorker | None = None,
    _context: multiprocessing.context.BaseContext | None = None,
) -> ParsedCvResponse:
    return await asyncio.to_thread(
        _parse_cv_isolated_sync,
        content,
        filename,
        extension,
        timeout_seconds,
        _worker or _parse_worker,
        _context or multiprocessing.get_context("spawn"),
    )


def _parse_cv_isolated_sync(
    content: bytes,
    filename: str,
    extension: str,
    timeout_seconds: float,
    worker: ParserWorker,
    context: multiprocessing.context.BaseContext,
) -> ParsedCvResponse:
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(
        target=worker,
        args=(sender, content, filename, extension),
        daemon=True,
    )
    started = False
    try:
        try:
            process.start()
            started = True
        except Exception as exc:
            raise CvParserProcessRejected("Parser process could not start") from exc
        finally:
            sender.close()
        if not receiver.poll(timeout_seconds):
            _terminate(process)
            raise CvParserProcessRejected("Parser timed out")
        try:
            status, payload = receiver.recv()
        except EOFError as exc:
            raise CvParserProcessRejected("Parser process exited") from exc
        process.join(timeout=1)
        if status != "ok":
            raise CvParserProcessRejected("Parser rejected file")
        return ParsedCvResponse.model_validate(payload)
    finally:
        receiver.close()
        if started:
            if process.is_alive():
                _terminate(process)
            else:
                process.join(timeout=1)


def _parse_worker(
    sender: Connection,
    content: bytes,
    filename: str,
    extension: str,
) -> None:
    try:
        _apply_resource_limits()
        result = parse_cv(content, filename, extension)
        sender.send(("ok", result.model_dump()))
    except BaseException:
        sender.send(("error", None))
    finally:
        sender.close()


def _apply_resource_limits() -> None:
    if sys.platform == "win32":
        return

    import resource

    cpu_soft = max(1, math.ceil(PARSER_CPU_LIMIT_SECONDS))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_soft, cpu_soft + 1))
    if sys.platform.startswith("linux"):
        resource.setrlimit(
            resource.RLIMIT_AS,
            (PARSER_MEMORY_LIMIT_BYTES, PARSER_MEMORY_LIMIT_BYTES),
        )


def _terminate(process: multiprocessing.Process) -> None:
    process.terminate()
    process.join(timeout=1)
    if process.is_alive() and hasattr(process, "kill"):
        process.kill()
        process.join(timeout=1)
