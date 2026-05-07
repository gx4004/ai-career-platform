"""Evaluation harness for the heuristic-vs-blended comparative study (Chapter 4.3).

Runs every (resume, job-description) pair from `thesis/eval-dataset.json` through
both modes (`blended`, `heuristic`) and writes the results to
`thesis/eval-results.json`. The results file feeds into the metric-extraction
script `scripts/analyze_eval_results.py` which prints the tables that fill the
*to be filled* cells in Chapter 4.3 of the thesis.

This script is intentionally a small, side-effect-light CLI rather than a pytest
fixture, because it exercises the live LLM path and produces ~200 LLM calls
per run (cost). Run it from the repository root:

    cd backend
    HEURISTIC_VERSION=v2 RESULT_CACHE_ENABLED=false \\
        python ../scripts/eval_scoring.py

The `HEURISTIC_VERSION=v2` is *required* — without it, the heuristic-mode runs
through the v1 lightweight prepass rather than the strong baseline that the
comparative study describes. `RESULT_CACHE_ENABLED=false` is required so the
latency numbers reflect cold-path execution.

Before running:
    1. Populate thesis/eval-dataset.json with N resumes × M JDs as a list of
       {id, resume, jd, role_track} objects.
    2. Make sure `is_admin = True` for any user that needs to flip the mode at
       runtime via /api/v1/admin/scoring-mode (the harness uses the in-process
       toggle, so admin users are not strictly required for the harness itself).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Make sure HEURISTIC_VERSION=v2 is in effect *before* `app.config` is imported
# anywhere downstream — the Settings object snapshots env vars at construction.
os.environ.setdefault("HEURISTIC_VERSION", "v2")
os.environ.setdefault("RESULT_CACHE_ENABLED", "false")

# Make `app` importable when run from anywhere
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.quality_signals_v2 import _idf_from_corpus, _tokenize, set_corpus_idf  # noqa: E402
from app.services.resume_analyzer import analyze_resume  # noqa: E402
from app.services import runtime_settings  # noqa: E402

DATASET = ROOT / "thesis" / "eval-dataset.json"
OUT = ROOT / "thesis" / "eval-results.json"


def install_corpus_idf(pairs: list[dict]) -> int:
    """Compute IDF over every distinct JD in the dataset and install it process-wide.

    Returns the number of JD documents the IDF was computed over. This is the
    table that BM25 inside `quality_signals_v2` will use throughout the run, so
    that BM25 values are comparable across pairs against a shared corpus rather
    than against the bundled ESCO baseline alone.
    """
    seen: set[str] = set()
    documents: list[list[str]] = []
    for pair in pairs:
        jd = pair.get("jd")
        if not jd or jd in seen:
            continue
        seen.add(jd)
        documents.append(_tokenize(jd))
    if not documents:
        return 0
    set_corpus_idf(_idf_from_corpus(documents))
    return len(documents)


async def run_pair(pair_id: str, resume_text: str, jd_text: str | None, mode: str) -> dict:
    runtime_settings.set_scoring_mode(mode)
    t0 = time.perf_counter()
    try:
        result = await analyze_resume(resume_text, jd_text)
        latency_ms = (time.perf_counter() - t0) * 1000
        return {
            "pair_id": pair_id,
            "mode": mode,
            "overall_score": result.get("overall_score"),
            "score_breakdown": result.get("score_breakdown"),
            "latency_ms": round(latency_ms, 2),
            "ok": True,
        }
    except Exception as exc:  # noqa: BLE001
        latency_ms = (time.perf_counter() - t0) * 1000
        return {
            "pair_id": pair_id,
            "mode": mode,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "latency_ms": round(latency_ms, 2),
        }


async def main() -> int:
    if not DATASET.exists():
        print(f"ERROR: evaluation dataset missing at {DATASET}", file=sys.stderr)
        print("Populate it with a list of {id, resume, jd, role_track} objects first.", file=sys.stderr)
        return 1

    pairs = json.loads(DATASET.read_text())
    print(f"Loaded {len(pairs)} pairs from {DATASET}")

    n_corpus = install_corpus_idf(pairs)
    print(f"Computed BM25 IDF over {n_corpus} distinct JDs and installed as runtime override.")

    rows: list[dict] = []
    for i, pair in enumerate(pairs):
        pid = pair.get("id") or f"pair-{i:03d}"
        resume = pair.get("resume", "")
        jd = pair.get("jd")
        for mode in ("blended", "heuristic"):
            row = await run_pair(pid, resume, jd, mode)
            print(
                f"[{i + 1:03d}/{len(pairs)}] {pid} {mode:>9}  -> "
                f"score={row.get('overall_score')}  latency={row.get('latency_ms')}ms"
            )
            rows.append(row)

    OUT.write_text(json.dumps(rows, indent=2))
    print(f"\nWrote {len(rows)} rows to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
