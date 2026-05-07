"""Recompute Chapter 4.3.4 token / cost numbers using the actual prompt content.

The original eval harness recorded `input_tokens_est = (len(resume) + len(jd)) // 4`,
which under-counts the real Gemini input by the size of the system prompt, the
locked payload, and the prepass evidence — all of which the runtime sends on
every call. This script rebuilds the exact prompt that `analyze_resume` sends
in blended mode for each pair in `thesis/eval-dataset.json`, counts characters,
and prints a corrected version of the §4.3.4 table.

By default it does not modify `thesis/eval-results.json`. With `--write` it
overwrites the per-pair `input_tokens_est` in place so that the standard
analyzer (`scripts/analyze_eval_results.py`) emits the same §4.3.4 numbers as
this script. The output-token side is left as captured by the original harness
(`len(json.dumps(result)) // 4`), since the response body is what was actually
returned.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Match the eval harness so the prompt builder's HEURISTIC_VERSION-conditioned
# branches see v2 (Section 4.2 of the thesis).
os.environ.setdefault("HEURISTIC_VERSION", "v2")

from app.prompts.resume import build_resume_prompt  # noqa: E402
from app.services.quality_signals_v2 import (  # noqa: E402
    build_resume_prepass_v2,
    compute_overall_score_v2,
    compute_resume_breakdown_v2,
)
from app.services.resume_analyzer import (  # noqa: E402
    CONFIDENCE_NOTE,
    SCHEMA_VERSION,
    _default_headline,
    _resume_verdict,
)
from app.services.quality_signals import detect_sector  # noqa: E402

DATASET = ROOT / "thesis" / "eval-dataset.json"
RESULTS = ROOT / "thesis" / "eval-results.json"

# Vertex AI Gemini 2.5 Flash pricing (per 1 M tokens), same constants the
# analyzer uses.
INPUT_RATE_PER_M = 0.075
OUTPUT_RATE_PER_M = 0.30


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    k = (len(s) - 1) * pct / 100.0
    import math
    f, c = int(math.floor(k)), int(math.ceil(k))
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


# Pinned timestamp so the recomputation is bit-identical across runs. The
# `generated_at` field is a fixed-length ISO string in the locked payload, so
# the character count (and therefore the token estimate) is unchanged from the
# value the production runtime would produce.
_PINNED_GENERATED_AT = "1970-01-01T00:00:00+00:00"


def rebuild_prompt(resume_text: str, jd_text: str | None) -> tuple[str, str]:
    """Reproduce the exact (system, user) pair that `analyze_resume` sent in blended mode."""
    prepass = build_resume_prepass_v2(resume_text, jd_text)
    breakdown = compute_resume_breakdown_v2(prepass)
    overall = compute_overall_score_v2(breakdown)
    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": _default_headline(overall, prepass.missing_keywords),
            "verdict": _resume_verdict(overall),
            "confidence_note": CONFIDENCE_NOTE,
        },
        "top_actions": [],
        "generated_at": _PINNED_GENERATED_AT,
        "overall_score": overall,
        "score_breakdown": breakdown,
        "strengths": [],
        "issues": [],
        "evidence": prepass.evidence(),
        "role_fit": None,
    }
    detected_sector = detect_sector(jd_text) if jd_text else None
    return build_resume_prompt(
        resume_text,
        jd_text,
        locked_payload,
        prepass.evidence(),
        detected_sector=detected_sector,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Overwrite per-pair input_tokens_est in thesis/eval-results.json so the standard analyzer prints the corrected §4.3.4 table.",
    )
    args = parser.parse_args()

    pairs = json.loads(DATASET.read_text())
    results = json.loads(RESULTS.read_text())
    by_pair = {(r["pair_id"], r["mode"]): r for r in results}

    input_tokens: list[int] = []
    output_tokens: list[int] = []
    per_call_usd: list[float] = []

    for pair in pairs:
        pid = pair["id"]
        blended = by_pair.get((pid, "blended"))
        if not blended or not blended.get("ok"):
            continue
        system, user = rebuild_prompt(pair["resume"], pair.get("jd"))
        # Approximate the same way Vertex docs suggest: ~4 chars per token.
        in_tok = (len(system) + len(user)) // 4
        # Output tokens were captured faithfully by the harness from the actual
        # response body, so reuse them.
        out_tok = int(blended.get("output_tokens_est", 0))
        cost = (in_tok * INPUT_RATE_PER_M / 1_000_000) + (out_tok * OUTPUT_RATE_PER_M / 1_000_000)
        input_tokens.append(in_tok)
        output_tokens.append(out_tok)
        per_call_usd.append(cost)
        if args.write:
            blended["input_tokens_est"] = in_tok

    n = len(input_tokens)
    mean_in = statistics.mean(input_tokens)
    mean_out = statistics.mean(output_tokens)
    mean_usd = statistics.mean(per_call_usd)
    p95_usd = percentile(per_call_usd, 95)
    monthly = mean_usd * 1000 * 30

    print(f"# Recomputed §4.3.4 — {n} successful blended pairs\n")
    print("| Cost item | Blended mode | Heuristic v2 mode |")
    print("|-----------|--------------|--------------------|")
    print(f"| Input tokens (avg., est.) | {mean_in:.0f} | 0 |")
    print(f"| Output tokens (avg., est.) | {mean_out:.0f} | 0 |")
    print(f"| Per-call USD (avg.) | ${mean_usd:.5f} | $0.00000 |")
    print(f"| Per-call USD (95th pct.) | ${p95_usd:.5f} | $0.00000 |")
    print(f"| 1 000 calls / day projected monthly bill | ${monthly:.2f} | $0.00 |")

    print(f"\nInput-token range: min={min(input_tokens)} median={statistics.median(input_tokens):.0f} max={max(input_tokens)}")
    print(f"Output-token range: min={min(output_tokens)} median={statistics.median(output_tokens):.0f} max={max(output_tokens)}")
    print(f"Per-call USD: min=${min(per_call_usd):.5f} median=${statistics.median(per_call_usd):.5f} max=${max(per_call_usd):.5f}")

    if args.write:
        RESULTS.write_text(json.dumps(results, indent=2))
        print(f"\nUpdated input_tokens_est in {RESULTS}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
