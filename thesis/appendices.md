# Appendices

> WEFiM rules section A.13: appendices are placed at the end of the document, after the bibliography. They are *not* part of the main page count for the body, but they do count toward the JSA upload. Each appendix should be referenced from the body at least once.

---

## Appendix A — Source listings

> Excerpted listings of the most thesis-relevant code. Each listing is a representative excerpt; full source files of the same name in the repository contain additional helpers, error handling, and inline documentation that are not reproduced here in the interest of length. Each listing is preceded by its file path so the reader can navigate to the corresponding location in the public repository at the moment of submission.

### A.1 Strong heuristic v2 — public entry point

`backend/app/services/quality_signals_v2.py`

```python
def build_resume_prepass_v2(
    resume_text: str,
    job_description: str | None = None,
    target_role_label: str | None = None,
) -> ResumePrepassV2:
    text = resume_text or ""
    sections = _detect_sections(text)
    bullets = [m.group(1) for m in _BULLET_RE.finditer(text)]
    tokens = _tokenize(text)

    resume_skills = _normalise_skills(text)
    matched: list[str] = []
    missing: list[str] = []
    matched_locations: list[tuple[str, str | None]] = []
    fuzzy_count = 0
    # ... (full body in the source file; see Section 4.2 of the thesis for the
    # accompanying methodological description)
```

### A.2 BM25 scoring

`backend/app/services/quality_signals_v2.py`

```python
def _bm25_score(
    resume_tf: dict[str, int],
    query_terms: list[str],
    idf: dict[str, float],
    avg_dl: float = 350.0,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """Standard BM25 score of a query against a single document's term-frequencies."""
    if not query_terms:
        return 0.0
    dl = sum(resume_tf.values()) or 1
    score = 0.0
    for term in query_terms:
        tf = resume_tf.get(term, 0)
        if tf == 0:
            continue
        term_idf = idf.get(term, math.log((1 + 0.5) / (0 + 0.5) + 1))
        norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avg_dl))
        score += term_idf * norm
    return score
```

### A.3 Runtime mode toggle

`backend/app/services/runtime_settings.py`

```python
ScoringMode = Literal["blended", "heuristic"]
_VALID_MODES: tuple[str, ...] = ("blended", "heuristic")

_initial_mode: ScoringMode = "blended"
configured = getattr(settings, "SCORING_MODE", "blended")
if configured in _VALID_MODES:
    _initial_mode = configured

_current_mode: ScoringMode = _initial_mode

def get_scoring_mode() -> ScoringMode:
    return _current_mode

def set_scoring_mode(mode: str) -> ScoringMode:
    global _current_mode
    if mode not in _VALID_MODES:
        raise ValueError(f"unknown scoring mode: {mode!r}")
    _current_mode = mode
    return _current_mode
```

### A.4 Shared tool pipeline

`backend/app/services/tool_pipeline.py`

```python
async def run_tool_pipeline(
    *,
    tool_name: str,
    service_fn: Callable[..., Awaitable[dict[str, Any]]],
    service_kwargs: dict[str, Any],
    label_fn: Callable[[dict[str, Any]], str],
    resume_text: str,
    job_description: str | None = None,
    feedback: str | None = None,
    parent_run_id: str | None = None,
    workspace_id: str | None = None,
    linked_context_ids: list[str] | None = None,
    current_user: User | None = None,
    db: Session,
    cache_extra_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Shared pipeline: sanitize -> cache -> service -> fallback -> persist -> respond."""
    # ... (sanitisation, cache lookup, service call, persistence, observability)
```

---

## Appendix B — Evaluation dataset description

The evaluation dataset used in Chapter 4.3 contains *N* = 30 resumes and *M* ≈ 20 job descriptions, organised into six role tracks: backend engineering, frontend engineering, full-stack engineering, data analytics, product design, and product management.

### B.1 Resume synthesis procedure

Each resume was synthesised from a templated structure that fills role-track-appropriate content into a fixed skeleton: a summary line, three to four employment entries with bulleted outcomes, a skills list of approximately ten items, a short education block, and an optional projects section. The synthesis script seeds the templated fields from a curated content library that contains role-typical titles, employer-name placeholders, and outcome phrasings. Quantification, action-verb usage, and section header consistency were varied deliberately across the 30 resumes to exercise the strong-heuristic features described in Chapter 4.2.

The synthesis script is `scripts/synthesise_resumes.py` (to be added in the morning together with the user). The full content library and the 30 generated `.txt` files live under `thesis/eval-dataset/resumes/`.

### B.2 Job description sampling procedure

Job descriptions were sampled from public listings on widely used job boards in March–April 2026. Identifying information — company names, hiring-manager names, exact compensation figures — was redacted before inclusion in the evaluation set. Each sampled description was reviewed for representativeness against the role track and lightly trimmed to remove non-substantive boilerplate. The 20 cleaned `.txt` files live under `thesis/eval-dataset/jds/`.

### B.3 Pair construction

The evaluation harness `scripts/eval_scoring.py` constructs all (resume, JD) pairs within the same role track. With five resumes per track and three to four JDs per track, this yields fifteen to twenty pairs per track, for approximately one hundred pairs in total.

### B.4 Pair manifest

A pair manifest lives at `thesis/eval-dataset.json` and lists every (resume_id, jd_id) pair with the role track, the seniority level, and any deliberate stress signals (e.g., "no quantification", "skills in summary only", "non-standard section headers") so the per-pair results in Section 4.3 can be inspected by failure mode rather than only as aggregate numbers.

---

## Appendix C — Production screenshots of the running system

> Capture against the live deployment on the day of submission. Save as `thesis/figures/ui-<tool>.png`. Each screenshot should be 1280 px wide. Include a caption that names the deployment URL and the date.

The following screens are referenced from the body:
- C.1 Landing page (signed-out)
- C.2 Resume Analyzer input page
- C.3 Resume Analyzer result page (blended mode)
- C.4 Resume Analyzer result page (heuristic-only mode)
- C.5 Job Match input page (paste mode)
- C.6 Job Match input page (URL scrape mode)
- C.7 Career Path result page
- C.8 Cover Letter result page
- C.9 Interview Q&A result page (with practice mode panel)
- C.10 Portfolio Planner result page
- C.11 Dashboard with history
- C.12 Admin scoring-mode toggle (blended → heuristic switch)

---

## Appendix D — Configuration reference

### D.1 Backend environment variables

The following environment variables are read at process start and configure the deployed system. Defaults shown in parentheses; consult `backend/app/config.py` for the authoritative list.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL DSN | `sqlite:///./career_platform.db` |
| `SECRET_KEY` | JWT signing secret | (must override) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime | 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh-token lifetime | 7 |
| `LLM_PROVIDER` | LLM dispatch backend | `vertex` |
| `LLM_MODEL` | Primary Gemini model | `gemini-2.5-flash` |
| `LLM_PRACTICE_MODEL` | Cheaper model used for interview practice feedback | (empty → falls back to `LLM_MODEL`) |
| `VERTEX_PROJECT_ID` | Google Cloud project | (must override) |
| `VERTEX_LOCATION` | Vertex region | `us-central1` |
| `BLENDED_SCORING_ENABLED` | Apply 60/40 LLM/heuristic blend | `true` |
| `SCORING_MODE` | Scoring core mode (`blended` or `heuristic`) — added with the comparative study | `blended` |
| `RESULT_CACHE_ENABLED` | In-memory cache | `true` |
| `RESULT_CACHE_TTL_SECONDS` | Cache TTL | 3600 |
| `CORS_ORIGINS` | Allowed CORS origins | `localhost` defaults |
| `FRONTEND_URL` | Canonical frontend URL | (set in production) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth | (must override) |
| `RESEND_API_KEY` | Transactional email | (must override) |
| `SENTRY_DSN` | Error tracking | (empty disables) |

### D.2 Administrative endpoints

The administrative HTTP API used for the comparative study is exposed under `/api/v1/admin/`:

- `GET /api/v1/admin/scoring-mode` → `AdminScoringModeResponse`
- `POST /api/v1/admin/scoring-mode` with body `{ "mode": "blended" | "heuristic" }` → returns the updated `AdminScoringModeResponse`

The response shape is:

```json
{
  "mode": "blended",
  "heuristic_version": "v1",
  "blended_weight_heuristic": 0.4,
  "blended_weight_llm": 0.6
}
```

Both endpoints require an authenticated administrator (the `users.is_admin` flag controls access) and are rate-limited at 60 requests per minute per administrator. The runtime mode change is held in process memory only; restarting the backend restores the configured default from the `SCORING_MODE` environment variable.

### D.3 Running the evaluation harness

```
$ cd backend
$ SCORING_MODE=blended RESULT_CACHE_ENABLED=false \
  python ../scripts/eval_scoring.py
$ python ../scripts/analyze_eval_results.py > ../thesis/chapter-04-results.md
```

The harness writes `thesis/eval-results.json`; the analyzer prints the Markdown tables ready to paste into Chapter 4.3.
