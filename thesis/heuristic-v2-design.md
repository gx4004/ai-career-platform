# Strong Heuristic v2 — Design Spec

> Implementation spec for `app/services/quality_signals_v2.py`. This is the engineering bridge between Chapter 4.2 of the thesis and actual code. Every component cited here has a corresponding paper in `bibliography.md`. Goal: defendable in front of the diploma jury.

---

## Goals and non-goals

**Goals**
- Produce a numerical resume score and a numerical match score that correlate with the blended (LLM+heuristic) mode at *r* ≥ 0.7 across the evaluation set.
- Run in < 50 ms per analysis at the 95th percentile.
- Use only classical, citable IR techniques. No neural networks, no embeddings, no third-party APIs.
- Coexist with the existing `quality_signals.py` — selectable via a `HEURISTIC_VERSION` flag.

**Non-goals**
- Beat the blended mode on qualitative output (prose recommendations, role-fit narratives). The blended mode wins this by design.
- Polish language. Add in V1.1.
- Online learning, fine-tuning, or training data collection.

---

## Components

### 1. TF–IDF and BM25 keyword scoring

**Citations:** Salton & McGill 1983 [28], Robertson & Zaragoza 2009 [27].

**Implementation (matches `quality_signals_v2.py` as shipped)**
- IDF resolution order:
  1. Per-call `corpus_idf=` argument to `build_resume_prepass_v2` (test path).
  2. Process-wide override installed via `set_corpus_idf` — used by the evaluation harness, computed once over the full set of evaluation JDs before any pair is scored.
  3. The bundled `_baseline_idf` table — pre-computed at import time from the ESCO knowledge base shipped with the application (each ESCO entry treated as one short document).
- For each (resume, JD) pair: deduplicate JD query terms, look up the active IDF table, skip OOV terms (Lucene-style df=0 handling), and accumulate the BM25 score against the resume's term-frequency map.
- BM25 contributes to the keywords axis as a soft additive boost rather than a stand-alone score: `keywords_score = clamp(0.7 · weighted_keyword_score + 0.3 · min(100, bm25 · 4))`.
- Parameters: *k₁* = 1.5, *b* = 0.75 (BM25 defaults).

**Pseudocode**
```python
def bm25_keyword_score(resume_terms: dict[str, int], jd_keywords: list[str], idf: dict[str, float], k1=1.5, b=0.75, avgdl=350) -> float:
    dl = sum(resume_terms.values()) or 1
    score = 0.0
    for kw in jd_keywords:
        tf = resume_terms.get(kw, 0)
        if tf == 0:
            continue
        kw_idf = idf.get(kw, math.log(1 + 1/1))   # smoothed default
        norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl/avgdl))
        score += kw_idf * norm
    return score
```

The raw BM25 value is *not* itself rescaled to [0, 100]; it is folded into the keywords axis through the soft-boost formula above (the `min(100, bm25 · 4)` clamp caps the contribution rather than rescaling).

### 2. ESCO skill normalisation

**Citations:** le Vrang et al. 2014 [17], ESCOX 2025 [18].

**Implementation**
- Bundle a curated ESCO subset as `app/data/esco_skills.json`.
- Each entry: `{"canonical": "PostgreSQL", "variants": ["postgres", "postgresql", "postgres database", "psql"]}`.
- Bundled at submission: ~100 entries covering the six role tracks (backend, frontend, full-stack, data, design, PM). Production target: ~800 entries — the JSON structure supports straightforward expansion.
- At analysis time: scan resume + JD for any variant occurrence (case-insensitive substring with word-boundary regex), normalise to canonical, and compute the intersection.

**Build pipeline (one-off offline script)**
- Download ESCO multilingual CSV from https://esco.ec.europa.eu/en/download
- Filter to `digital`, `creative`, and `business-services` skill groups
- Extract preferred label + alt-labels per row
- Write to `app/data/esco_skills.json`
- Manual cleanup: remove ambiguous entries (e.g., "Java" vs "java" the indonesian island)

### 3. Fuzzy matching

**Citations:** Levenshtein 1966 [29].

**Implementation (current — stdlib only, ships with the thesis)**
- `difflib.SequenceMatcher(None, target, candidate).ratio()` with threshold *τ* = 0.85.
- Apply only after exact and ESCO-normalised matching have failed.
- Bound complexity by capping the candidate set per query at 200 tokens (`quality_signals_v2.py:_fuzzy_match`). A 30%-of-total-matches cap to prevent false-positive runaway in noisy resumes is documented as a future hardening step; it is **not** implemented in the version that ships with the thesis.

```python
from difflib import SequenceMatcher

def _fuzzy_match(target: str, candidates, threshold: float = 0.85) -> bool:
    target_lower = target.lower()
    for cand in list(candidates)[:200]:  # bound complexity
        if SequenceMatcher(None, target_lower, cand.lower()).ratio() >= threshold:
            return True
    return False
```

**Future option (rapidfuzz):** swap `difflib.SequenceMatcher` for `rapidfuzz.fuzz.token_set_ratio` once the dependency surface is opened up; the threshold (~85, scaled to 0–100) and the call shape map directly. The 30% cap can be added at that point.

### 4. Section-weighted features

**Implementation**
- Identify sections via header regex: `Skills`, `Experience`, `Projects`, `Summary`, `Education`, `Certifications`.
- Per-section weights:

```python
SECTION_WEIGHTS = {
    "skills": 1.0,
    "experience": 0.7,
    "projects": 0.7,
    "summary": 0.5,
    "education": 0.3,
    "certifications": 0.5,
    "_default": 0.4,   # for matches outside any detected section
}
```

- For each matched keyword, look up which section it appeared in and weight accordingly.
- Final keyword sub-score = (sum of weighted matches) / (sum of weights if every keyword had matched in Skills) * 100.

### 5. Quantification regex

**Implementation** — single composite regex, then count distinct bullet lines that contain at least one match.

```python
QUANT_PATTERN = re.compile(
    r"(?:\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|×)|"            # 12%, 3x
    r"\$\s?\d+(?:[.,]\d+)?(?:[kKmMbB])?|"                    # $200, $1.5M
    r"\b\d+(?:[.,]\d+)?\s?(?:k|K|M|m|B|b)\b|"                # 50k, 2M
    r"\b\d+\s+(?:users?|customers?|clients?|teams?|people)|" # 200 users
    r"\b\d+\s+(?:weeks?|months?|years?|days?|hours?))",      # 6 months
    flags=re.IGNORECASE,
)

def count_quantified_bullets(bullets: list[str]) -> int:
    return sum(1 for b in bullets if QUANT_PATTERN.search(b))
```

Saturating logarithmic weight in the impact sub-score:
```
impact_quant_term = min(40, 12 * log2(1 + quantified_count))
```

### 6. Action-verb scoring

**Implementation** — bundled list of ~190 strong action verbs in `app/data/action_verbs.txt`. Source: aggregated from publicly available career-services resources of established universities (Harvard FAS, MIT Career Advising, Princeton Career Development).

```python
def action_verb_fraction(bullets: list[str], action_verbs: set[str]) -> float:
    if not bullets:
        return 0.0
    starts = [b.strip().split()[0].lower().rstrip(".,") for b in bullets if b.strip()]
    hits = sum(1 for w in starts if w in action_verbs)
    return hits / max(1, len(starts))
```

Linear contribution to clarity sub-score: `clarity_verb_term = action_verb_fraction * 25`.

### 7. Score combination

**Weights** (sum to 1.00):
- keywords: 0.30
- impact: 0.25
- structure: 0.15
- clarity: 0.15
- completeness: 0.15

**Source for the weights:** **author-selected**, motivated by the design intuition that recruiter-side scanning is dominated by keyword and impact signals with structural / clarity / completeness signals carrying smaller but non-trivial weight. The weights are *not* derived from a published survey, and the thesis does not claim such a derivation. Robustness is established through the sensitivity analysis described in Chapter 4.3.5 (rerun under equal weights), not through external citation.

```python
def combine(sub_scores: dict[str, int]) -> int:
    weights = {"keywords": 0.30, "impact": 0.25, "structure": 0.15, "clarity": 0.15, "completeness": 0.15}
    return round(sum(sub_scores[k] * weights[k] for k in weights))
```

---

## Data files to create

```
backend/app/data/
├── esco_skills.json          # ~100 entries at submission (production target ~800)
└── action_verbs.txt          # ~190 action verbs, one per line
```

---

## Module structure

```
backend/app/services/
├── quality_signals.py        # existing, lightweight v1 — leave untouched
├── quality_signals_v2.py     # new, strong heuristic
└── runtime_settings.py       # new, in-memory mode toggle for /admin
```

`quality_signals_v2.py` exports:

```python
def build_resume_prepass_v2(resume_text, job_description) -> ResumePrepassV2: ...
def compute_resume_breakdown_v2(prepass) -> list[dict]: ...
def compute_match_score_v2(prepass) -> int: ...
def compute_overall_score_v2(breakdown) -> int: ...
def confidence_gap_note_v2(heuristic, llm) -> str | None: ...
```

The signatures intentionally mirror v1, so swapping versions in `resume_analyzer.py` and `job_matcher.py` is one import-line change behind the `HEURISTIC_VERSION` flag.

---

## Runtime toggle module

`backend/app/services/runtime_settings.py`:

```python
from typing import Literal

ScoringMode = Literal["blended", "heuristic"]
_current_mode: ScoringMode = "blended"   # default; env var SCORING_MODE may override at startup

def get_scoring_mode() -> ScoringMode:
    return _current_mode

def set_scoring_mode(mode: ScoringMode) -> None:
    global _current_mode
    if mode not in {"blended", "heuristic"}:
        raise ValueError(f"unknown mode: {mode}")
    _current_mode = mode
```

Initialise from `settings.SCORING_MODE` on import.

---

## Admin endpoints to add to `app/routers/admin.py`

```python
@router.get("/scoring-mode")
def get_scoring_mode_endpoint(current_user: AdminUser = Depends(require_admin)) -> dict:
    return {"mode": runtime_settings.get_scoring_mode()}

@router.post("/scoring-mode")
def set_scoring_mode_endpoint(payload: ScoringModePayload, current_user: AdminUser = Depends(require_admin)) -> dict:
    runtime_settings.set_scoring_mode(payload.mode)
    return {"mode": runtime_settings.get_scoring_mode()}
```

Where `ScoringModePayload` is `class ScoringModePayload(BaseModel): mode: Literal["blended", "heuristic"]`.

`require_admin` dependency: must check `current_user.is_admin == True`. If the user model does not yet have an `is_admin` flag, add a SQLAlchemy column and an Alembic migration before the toggle ships.

---

## Resume Analyzer integration

In `app/services/resume_analyzer.py`, replace the LLM-call block with:

```python
from app.services.runtime_settings import get_scoring_mode

if get_scoring_mode() == "heuristic":
    return _build_heuristic_fallback(prepass, heuristic_breakdown, heuristic_overall, generated_at)

# else: existing path — call LLM, then blend
```

Same single-line guard goes into `app/services/job_matcher.py` before its LLM call.

---

## Frontend admin toggle

`frontend/src/pages/admin/scoring-mode.tsx` (new):
- Read current mode via `GET /api/v1/admin/scoring-mode`
- Toggle button: `Blended` ↔ `Heuristic only`
- POST on toggle, optimistic update + reconcile
- Visible warning when in heuristic mode: "LLM bypassed — analytical tools running on classical IR only."

---

## Evaluation harness

`scripts/eval_scoring.py` (new):

```python
"""Run the evaluation set through both modes, write results to thesis/eval-results.json."""

import asyncio, json, time
from pathlib import Path

from app.services.resume_analyzer import analyze_resume
from app.services.runtime_settings import set_scoring_mode

DATASET = Path(__file__).parent.parent / "thesis" / "eval-dataset.json"
OUT = Path(__file__).parent.parent / "thesis" / "eval-results.json"

async def run_pair(resume_text, jd_text, mode):
    set_scoring_mode(mode)
    t0 = time.perf_counter()
    result = await analyze_resume(resume_text, jd_text)
    dt = (time.perf_counter() - t0) * 1000
    return {"mode": mode, "score": result["overall_score"], "latency_ms": dt, "result": result}

async def main():
    pairs = json.loads(DATASET.read_text())
    rows = []
    for pair in pairs:
        r = pair["resume"]; j = pair["jd"]
        for mode in ("blended", "heuristic"):
            row = await run_pair(r, j, mode)
            rows.append({"pair_id": pair["id"], **row})
    OUT.write_text(json.dumps(rows, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
```

Then a small Python notebook or CLI tool computes the metrics for Chapter 4.3 from `eval-results.json`:
- Pearson correlation per (mode, sub-score)
- Mean / std / median / KS distance
- Latency percentiles
- Cost (token counts × Vertex AI pricing)

---

## Open items for tomorrow morning

1. **Generate ESCO subset.** One-off script against ESCO multilingual CSV. ~30 min.
2. **Curate action-verb list.** Pull from Harvard/MIT/Princeton sources. ~20 min.
3. **Synthesise 30 evaluation resumes.** Use a script that fills templated structures with role-track-appropriate content. ~45 min.
4. **Sample 20 job descriptions.** Pull from public boards, redact identifiers. ~30 min.
5. **Implement v2 in code.** ~90 min.
6. **Run eval harness.** ~10 min compute + ~20 min metric extraction.
7. **Fill *to be filled* cells in Chapter 4.3** with the harness output. ~30 min.
8. **Live-toggle smoke test.** Click /admin toggle, confirm Resume + Job Match return heuristic-only when `mode=heuristic`. ~10 min.

Total estimated work tomorrow: ~5–6 hours focused. Within the 8-hour writing-day budget; leaves buffer for figure exports, abstract refinement, and supervisor email.
