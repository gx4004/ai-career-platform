"""Strong heuristic v2 for the comparative study reported in Chapter 4 of the thesis.

Defendable, classical-IR resume scoring pipeline. Strictly non-neural so the
heuristic-vs-LLM line in the comparative study stays clean.

Components:
    - Section detection via header regex
    - TF-IDF / BM25 keyword scoring (Salton & McGill 1983; Robertson & Zaragoza 2009)
    - ESCO-aligned skill normalisation (le Vrang et al. 2014; ESCOX 2025)
    - Levenshtein-style fuzzy matching via stdlib difflib (Levenshtein 1966)
    - Section-weighted features
    - Quantification regex with logarithmic saturation
    - Action-verb dictionary

This module does NOT import or replace the existing `quality_signals.py`. It is
intended to be selected at the call site (resume_analyzer.py / job_matcher.py)
when `HEURISTIC_VERSION=v2` or when `runtime_settings.get_scoring_mode() == "heuristic"`.

Stdlib only — no rapidfuzz, no scikit-learn — to keep the dependency surface
unchanged for the thesis demonstration. A migration path to rapidfuzz/sklearn
is documented in `thesis/heuristic-v2-design.md`.
"""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bundled data files
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_ESCO_PATH = _DATA_DIR / "esco_skills.json"
_ACTION_VERBS_PATH = _DATA_DIR / "action_verbs.txt"


# Two-letter ESCO surface variants collide with extremely common English tokens
# (`ai` → Adobe Illustrator, `go` → Go, `cv` → Computer vision, `ml`, `ts`, `js`,
# `py`, `np`, `tf`, `ps`, `pm`). Drop variants below this length; abbreviations
# that include a non-alphanumeric character (e.g. "c#", "c++", ".net") are still
# admitted because they carry their own disambiguating punctuation.
_MIN_ESCO_VARIANT_LEN = 3


@lru_cache(maxsize=1)
def _load_esco() -> tuple[dict[str, str], dict[str, list[str]]]:
    """Return (variant_to_canonical, canonical_to_variants).

    `variant_to_canonical` maps each lowercase surface variant to its canonical label.
    `canonical_to_variants` is the reverse for diagnostics.

    Short alphabetic variants (length < `_MIN_ESCO_VARIANT_LEN`) are filtered out
    to prevent false-positive matches against common English words. Variants
    containing non-alphanumeric characters (e.g. "c#", "c++") bypass the length
    filter because they cannot collide with English vocabulary.
    """
    if not _ESCO_PATH.exists():
        logger.warning("ESCO data file missing at %s; skill normalisation disabled.", _ESCO_PATH)
        return {}, {}
    payload = json.loads(_ESCO_PATH.read_text(encoding="utf-8"))
    skills = payload.get("skills", [])
    variant_to_canonical: dict[str, str] = {}
    canonical_to_variants: dict[str, list[str]] = {}
    for entry in skills:
        canonical = str(entry.get("canonical", "")).strip()
        if not canonical:
            continue
        raw_variants = [str(v).strip().lower() for v in entry.get("variants", []) if v]
        # Filter short alphabetic variants that collide with English words.
        variants = [
            v for v in raw_variants
            if len(v) >= _MIN_ESCO_VARIANT_LEN or not v.isalpha()
        ]
        canonical_to_variants[canonical] = variants
        for v in variants:
            variant_to_canonical[v] = canonical
        # Apply the same filter to the canonical-add: a short alphabetic
        # canonical (e.g., "Go") would otherwise be re-introduced as a key in
        # the lookup table and re-fire on common English words ("go to market",
        # "go live"). Multi-word and non-alphabetic canonicals are admitted as
        # before. Skills whose canonical is short alphabetic remain matchable
        # via their longer variants ("golang" for Go, etc.).
        if len(canonical) >= _MIN_ESCO_VARIANT_LEN or not canonical.isalpha():
            variant_to_canonical[canonical.lower()] = canonical
    return variant_to_canonical, canonical_to_variants


@lru_cache(maxsize=1)
def _load_action_verbs() -> frozenset[str]:
    if not _ACTION_VERBS_PATH.exists():
        logger.warning("Action-verb file missing at %s; verb scoring disabled.", _ACTION_VERBS_PATH)
        return frozenset()
    verbs = set()
    for line in _ACTION_VERBS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        verbs.add(line.lower())
    return frozenset(verbs)


# ---------------------------------------------------------------------------
# Tokenisation and section detection
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]{1,}")

# Section headers — capitalised keys to match v1's contract (resume_analyzer's
# _heuristic_issues compares against the literals "Summary", "Experience",
# "Skills", "Education"). Patterns admit both bare-line headers and the inline
# "Header: content" form by allowing optional content after the colon.
_SECTION_HEADERS = {
    "Summary": re.compile(
        r"^\s*(summary|profile|about|objective|professional summary|career summary|"
        r"introduction|overview|personal profile)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "Experience": re.compile(
        r"^\s*(experience|work experience|employment|professional experience|"
        r"work history|career history|relevant experience|professional history|"
        r"employment history)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "Skills": re.compile(
        r"^\s*(skills|technical skills|core skills|key skills|competencies|"
        r"technologies|tech stack|tools|tools and technologies|hard skills|"
        r"core competencies|technical competencies|technical proficiency)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "Education": re.compile(
        r"^\s*(education|academic background|academic qualifications|qualifications|"
        r"academic|education and training)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "Projects": re.compile(
        r"^\s*(projects|selected projects|portfolio|side projects|personal projects|"
        r"key projects|notable projects)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "Certifications": re.compile(
        r"^\s*(certifications?|licenses?|courses?|professional certifications?|"
        r"continuing education|trainings?)\s*(?::.*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
}

_BULLET_RE = re.compile(r"^\s*[-•●·*▪◦]\s+(.+)$", re.MULTILINE)


def _tokenize(text: str) -> list[str]:
    """Tokenise text and strip trailing sentence punctuation.

    The body character class admits `.`, `/`, `-`, `+`, `#` so that intra-token
    punctuation in skill names (`react.js`, `node-js`, `ci/cd`, `c++`, `c#`) is
    preserved by the regex. Trailing punctuation that ends a sentence — `.`,
    `,`, `;`, `:`, `!`, `?`, `/` — is then stripped so that `'fastapi.'` and
    `'fastapi'` collapse to the same token. Without this rstrip, BM25, TF
    lookups, the unique-token containment fast path, and the corpus-IDF table
    all silently fragment around punctuation context.
    """
    out: list[str] = []
    for m in _TOKEN_RE.finditer(text):
        tok = m.group(0).lower().rstrip(".,;:!?/")
        if tok:
            out.append(tok)
    return out


def _detect_sections(text: str) -> dict[str, list[tuple[int, int]]]:
    """Return {section_name: [(start_offset, end_offset), ...]} for detected sections.

    Returns a list of ranges per canonical name so that resumes which contain the
    same canonical section twice (e.g. both "Technical Skills" and "Tools" mapping
    to "Skills") preserve the content under each occurrence rather than overwriting.
    """
    hits: list[tuple[int, str]] = []
    for name, pattern in _SECTION_HEADERS.items():
        for m in pattern.finditer(text):
            hits.append((m.start(), name))
    if not hits:
        return {}
    hits.sort()
    sections: dict[str, list[tuple[int, int]]] = {}
    for i, (offset, name) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(text)
        sections.setdefault(name, []).append((offset, end))
    return sections


def _section_for_offset(offset: int, sections: dict[str, list[tuple[int, int]]]) -> str | None:
    for name, ranges in sections.items():
        for start, end in ranges:
            if start <= offset < end:
                return name
    return None


# ---------------------------------------------------------------------------
# Quantification regex
# ---------------------------------------------------------------------------

_QUANT_RE = re.compile(
    # %/× alternation: no trailing \b — `%` and `×` are non-word characters, so
    # `\b` after them requires the next character to be a word character, which
    # systematically misses the dominant resume case "improved by 30%." (period
    # / space / EOS after the percent sign).
    r"(?:\b\d+(?:[.,]\d+)?\s*(?:%|×)(?!\w)"
    # Word-ending alternations keep \b safely.
    r"|\b\d+(?:[.,]\d+)?\s*(?:percent|times|x)\b"
    r"|\$\s?\d+(?:[.,]\d+)?(?:[kKmMbB])?"
    r"|\b\d+(?:[.,]\d+)?\s?(?:k|K|M|m|B|b)\b"
    r"|\b\d+\s+(?:users?|customers?|clients?|teams?|people|employees?|engineers?|developers?)\b"
    r"|\b\d+\s+(?:weeks?|months?|years?|days?|hours?|sprints?|quarters?)\b"
    r"|\b(?:reduced|cut|grew|increased|improved|saved|generated|raised)\s+(?:by\s+)?\d)",
    flags=re.IGNORECASE,
)


def _count_quantified_bullets(bullets: Iterable[str]) -> int:
    return sum(1 for b in bullets if _QUANT_RE.search(b))


# ---------------------------------------------------------------------------
# IDF and BM25
# ---------------------------------------------------------------------------

# Default IDF: built lazily on first call from a small bundled corpus of generic
# English job postings + the current resume + JD as additional documents. For the
# thesis evaluation harness we replace this with a corpus-IDF computed across all
# evaluation JDs (see `scripts/eval_scoring.py`).

_DEFAULT_AVG_DL = 350.0  # average resume token length (rough prior)
_BM25_K1 = 1.5
_BM25_B = 0.75


def _idf_from_corpus(documents: list[list[str]]) -> dict[str, float]:
    """Plain inverse-document-frequency with add-one smoothing."""
    if not documents:
        return {}
    df: dict[str, int] = {}
    for doc in documents:
        seen = set(doc)
        for term in seen:
            df[term] = df.get(term, 0) + 1
    n = len(documents)
    return {term: math.log((n - dfi + 0.5) / (dfi + 0.5) + 1) for term, dfi in df.items()}


_corpus_idf_override: dict[str, float] | None = None


def set_corpus_idf(idf: dict[str, float] | None) -> None:
    """Install a process-wide corpus IDF override.

    Used by the evaluation harness to plug in an IDF table computed over the
    full evaluation JD corpus before any pair is scored. Pass `None` to clear
    the override and restore the bundled ESCO baseline.
    """
    global _corpus_idf_override
    _corpus_idf_override = idf


def get_active_idf() -> dict[str, float]:
    """Return the corpus IDF currently in use (override if set, else baseline)."""
    return _corpus_idf_override if _corpus_idf_override is not None else _baseline_idf()


@lru_cache(maxsize=1)
def _baseline_idf() -> dict[str, float]:
    """Pre-computed IDF over the bundled ESCO knowledge base.

    Each ESCO entry (canonical label plus its surface variants) is treated as
    one short document. The resulting IDF table favours rare technical terms
    over common ones across the curated corpus shipped with the application;
    it is a stable approximation when no real evaluation corpus is provided.

    The evaluation harness can override this by passing a precomputed corpus
    IDF (computed across the full set of evaluation job descriptions) into
    `build_resume_prepass_v2(..., corpus_idf=...)`.
    """
    _, canonical_to_variants = _load_esco()
    documents: list[list[str]] = []
    for canonical, variants in canonical_to_variants.items():
        tokens: list[str] = list(_tokenize(canonical))
        for v in variants:
            tokens.extend(_tokenize(v))
        if tokens:
            documents.append(tokens)
    return _idf_from_corpus(documents) if documents else {}


def _bm25_score(
    resume_tf: dict[str, int],
    query_terms: list[str],
    idf: dict[str, float],
    avg_dl: float = _DEFAULT_AVG_DL,
    k1: float = _BM25_K1,
    b: float = _BM25_B,
) -> float:
    """Standard BM25 score of a query against a single document's term-frequencies.

    The standard BM25 formulation (Robertson & Zaragoza 2009) sums over **unique**
    query terms; iterating the raw token stream would multiply each term's
    contribution by its query-term-frequency, so a JD that mentions Python three
    times would receive a score 3× higher than the same JD with a single mention,
    independent of resume content. We deduplicate here to keep the function's
    contract aligned with its docstring.
    """
    if not query_terms:
        return 0.0
    dl = sum(resume_tf.values()) or 1
    score = 0.0
    seen: set[str] = set()
    for term in query_terms:
        if term in seen:
            continue
        seen.add(term)
        tf = resume_tf.get(term, 0)
        if tf == 0:
            continue
        term_idf = idf.get(term, math.log((1 + 0.5) / (0 + 0.5) + 1))  # smoothed default
        norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avg_dl))
        score += term_idf * norm
    return score


# ---------------------------------------------------------------------------
# Fuzzy matching (stdlib)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.85


def _fuzzy_match(target: str, candidates: Iterable[str], threshold: float = _FUZZY_THRESHOLD) -> bool:
    """Return True if any candidate has SequenceMatcher ratio >= threshold.

    SequenceMatcher is the Python stdlib equivalent of a normalised Levenshtein
    similarity for the purposes of catching typographic variants ("Javacript",
    "PostgresSQL"). The 200-candidate cap protects against pathological inputs;
    callers are expected to pass a deduplicated unique-token set rather than the
    raw token stream so the cap acts on vocabulary, not document position.
    """
    target_lower = target.lower()
    seen: set[str] = set()
    n = 0
    for cand in candidates:
        cl = cand.lower()
        if cl in seen:
            continue
        seen.add(cl)
        n += 1
        if n > 200:
            break
        if SequenceMatcher(None, target_lower, cl).ratio() >= threshold:
            return True
    return False


# ---------------------------------------------------------------------------
# ESCO normalisation
# ---------------------------------------------------------------------------

def _normalise_skills(text: str) -> set[str]:
    """Return the set of canonical ESCO labels detected anywhere in `text`.

    Variants are matched as whole-word substrings. ESCO-defined canonical labels
    take precedence; fuzzy matching is *not* applied here because it is too
    lossy at the skill-normalisation layer (would conflate Java and JavaScript).
    """
    variant_to_canonical, _ = _load_esco()
    text_lower = text.lower()
    found: set[str] = set()
    for variant, canonical in variant_to_canonical.items():
        # Word-boundary search; for tokens with punctuation (c++, .net) use a
        # softer substring check.
        if re.search(rf"(?<![a-z0-9]){re.escape(variant)}(?![a-z0-9])", text_lower):
            found.add(canonical)
    return found


# ---------------------------------------------------------------------------
# Section-weighted matching
# ---------------------------------------------------------------------------

_SECTION_WEIGHTS: dict[str, float] = {
    "Skills": 1.0,
    "Experience": 0.7,
    "Projects": 0.7,
    "Summary": 0.5,
    "Education": 0.3,
    "Certifications": 0.5,
    "_default": 0.4,
}


def _weighted_match_score(
    matched_locations: list[tuple[str, str | None]],
    total_required: int,
) -> float:
    """Compute a 0–100 weighted-coverage score.

    matched_locations is a list of (keyword, section) pairs, with section=None when
    the match was outside any detected section.
    """
    if total_required == 0:
        return 0.0
    achieved = 0.0
    for _, section in matched_locations:
        weight = _SECTION_WEIGHTS.get(section or "_default", _SECTION_WEIGHTS["_default"])
        achieved += weight
    max_achievable = total_required * _SECTION_WEIGHTS["Skills"]
    return min(100.0, (achieved / max_achievable) * 100.0)


# ---------------------------------------------------------------------------
# Public dataclass
# ---------------------------------------------------------------------------


@dataclass
class ResumePrepassV2:
    """Output of the strong heuristic prepass.

    Mirrors the shape of `ResumePrepass` from `quality_signals.py` so that
    existing call sites in `resume_analyzer.py` and `job_matcher.py` can be
    redirected with minimal change. Additional v2-specific fields carry the
    BM25 numerator, the ESCO normalisation result, and the action-verb
    fraction so that Chapter 4's results can read these directly.
    """

    detected_sections: list[str] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)
    detected_skills: list[str] = field(default_factory=list)
    quantified_bullets: int = 0
    bullet_lines: int = 0
    word_count: int = 0
    target_role_label: str | None = None

    # v2-specific
    bm25_keyword_score: float = 0.0
    weighted_keyword_score: float = 0.0
    action_verb_fraction: float = 0.0
    fuzzy_match_count: int = 0

    def evidence(self) -> dict[str, object]:
        return {
            "detected_sections": list(self.detected_sections),
            "matched_keywords": list(self.matched_keywords),
            "missing_keywords": list(self.missing_keywords),
            "detected_skills": list(self.detected_skills),
            "quantified_bullets": self.quantified_bullets,
            "bullet_lines": self.bullet_lines,
            "word_count": self.word_count,
            "target_role_label": self.target_role_label,
            "bm25_keyword_score": round(self.bm25_keyword_score, 3),
            "weighted_keyword_score": round(self.weighted_keyword_score, 3),
            "action_verb_fraction": round(self.action_verb_fraction, 3),
            "fuzzy_match_count": self.fuzzy_match_count,
        }


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def _best_section_for_canonical(
    canonical: str,
    text_lower: str,
    sections: dict[str, list[tuple[int, int]]],
    canonical_to_variants: dict[str, list[str]],
) -> str | None:
    """Find the strongest-section occurrence of a canonical ESCO skill.

    Iterates every variant of the canonical (canonical itself + bundled variants),
    locates *every* occurrence, looks up the section each occurrence falls into,
    and returns the section with the highest weight. This addresses two defects:
        (1) `str.find` returns only the first occurrence, so a skill appearing
            in both Education and Skills latches onto whichever appears first.
        (2) Searching for the *canonical* form misses variants — a resume that
            says "postgres" against a canonical "PostgreSQL" would otherwise
            silently fall back to the default section weight.
    """
    forms = [canonical.lower(), *canonical_to_variants.get(canonical, [])]
    best_section: str | None = None
    best_weight = -1.0
    default_weight = _SECTION_WEIGHTS["_default"]
    for form in forms:
        if not form:
            continue
        # Word-boundary regex so "java" doesn't match inside "javascript"
        pattern = rf"(?<![a-z0-9]){re.escape(form)}(?![a-z0-9])"
        for m in re.finditer(pattern, text_lower):
            section = _section_for_offset(m.start(), sections)
            weight = _SECTION_WEIGHTS.get(section or "_default", default_weight)
            if weight > best_weight:
                best_weight = weight
                best_section = section
    return best_section


def build_resume_prepass_v2(
    resume_text: str,
    job_description: str | None = None,
    target_role_label: str | None = None,
    *,
    corpus_idf: dict[str, float] | None = None,
) -> ResumePrepassV2:
    """Build the strong-heuristic-v2 prepass output for a (resume, JD) pair.

    `corpus_idf` may be provided by the evaluation harness when it has computed
    IDF over the full set of evaluation job descriptions; otherwise the bundled
    ESCO-derived baseline IDF is used (see `_baseline_idf`).
    """
    text = resume_text or ""
    text_lower = text.lower()
    sections = _detect_sections(text)
    bullets = [m.group(1) for m in _BULLET_RE.finditer(text)]
    tokens = _tokenize(text)
    unique_tokens = set(tokens)
    _, canonical_to_variants = _load_esco()

    # Auto-derive the target role label from the JD if the caller did not pass
    # one. Mirrors the v1 contract so role_fit downstream remains populated.
    if target_role_label is None and job_description:
        try:
            from app.services.quality_signals import extract_role_label
            target_role_label = extract_role_label(job_description) or None
        except Exception:  # noqa: BLE001
            target_role_label = None

    resume_skills = _normalise_skills(text)

    matched: list[str] = []
    missing: list[str] = []
    matched_locations: list[tuple[str, str | None]] = []
    fuzzy_count = 0

    if job_description:
        jd_skills = _normalise_skills(job_description)
        # When ESCO yields no skills for the JD, do not fabricate a skill set
        # from raw token frequency — the previous fallback pulled in stop words
        # ("must", "with", "team") and contaminated the keyword statistics.
        # Leaving the set empty causes `compute_match_score_v2` to return its
        # neutral score, which is the honest behaviour when the JD has no
        # role-relevant signal the heuristic can recognise.
        for skill in sorted(jd_skills):
            # Exact / ESCO-normalised match: also true when any variant of the
            # canonical surfaces in the resume's normalised set or in tokens.
            in_resume_skills = skill in resume_skills
            in_tokens = skill.lower() in unique_tokens
            if in_resume_skills or in_tokens:
                matched.append(skill)
                section = _best_section_for_canonical(
                    skill, text_lower, sections, canonical_to_variants
                )
                matched_locations.append((skill, section))
                continue
            # Fuzzy fallback against the deduplicated unique-token vocabulary
            # (not the ordered, duplicate-laden token stream — otherwise the
            # candidate cap silently truncates everything past the first ~200
            # tokens of the resume).
            if _fuzzy_match(skill, unique_tokens):
                matched.append(skill)
                matched_locations.append((skill, None))
                fuzzy_count += 1
                continue
            missing.append(skill)

    # BM25 keyword score. Resolution order: explicit per-call corpus_idf (test
    # path) → process-wide override installed by `set_corpus_idf` (eval-harness
    # path, computed once over all JDs) → bundled ESCO baseline (production /
    # single-pair path).
    resume_tf: dict[str, int] = {}
    for tok in tokens:
        resume_tf[tok] = resume_tf.get(tok, 0) + 1
    jd_tokens = _tokenize(job_description or "")
    if corpus_idf is not None:
        idf_table = corpus_idf
    elif _corpus_idf_override is not None:
        idf_table = _corpus_idf_override
    else:
        idf_table = _baseline_idf()
    bm25 = _bm25_score(resume_tf, jd_tokens, idf_table)

    weighted = _weighted_match_score(matched_locations, total_required=len(matched) + len(missing))

    # Action-verb fraction
    action_verbs = _load_action_verbs()
    starts = [b.strip().split()[0].lower().rstrip(".,") for b in bullets if b.strip()]
    if starts and action_verbs:
        verb_hits = sum(1 for w in starts if w in action_verbs)
        action_fraction = verb_hits / len(starts)
    else:
        action_fraction = 0.0

    return ResumePrepassV2(
        detected_sections=list(sections.keys()),
        matched_keywords=matched,
        missing_keywords=missing,
        detected_skills=sorted(resume_skills),
        quantified_bullets=_count_quantified_bullets(bullets),
        bullet_lines=len(bullets),
        word_count=len(tokens),
        target_role_label=target_role_label,
        bm25_keyword_score=bm25,
        weighted_keyword_score=weighted,
        action_verb_fraction=action_fraction,
        fuzzy_match_count=fuzzy_count,
    )


def compute_resume_breakdown_v2(prepass: ResumePrepassV2) -> list[dict[str, int | str]]:
    """Five-axis breakdown using the v2 signals."""
    def clamp(v: float) -> int:
        return int(round(max(0.0, min(100.0, v))))

    # keywords: weighted-coverage + a soft BM25 boost. When no JD context is
    # available, both signals are zero by construction; fall back to a skill-
    # density baseline derived from detected ESCO skills so the keywords axis
    # is not pinned to 0 on the resume-only path. This mirrors the v1 fallback
    # (see `quality_signals.compute_resume_breakdown`).
    if not prepass.matched_keywords and not prepass.missing_keywords:
        keywords_score = clamp(36 + len(prepass.detected_skills) * 7)
    else:
        keywords_score = clamp(
            0.7 * prepass.weighted_keyword_score
            + 0.3 * min(100.0, prepass.bm25_keyword_score * 4)
        )

    # impact: saturating logarithmic on quantified bullets + verb fraction
    impact_score = clamp(
        20
        + 12 * math.log2(1 + prepass.quantified_bullets)
        + 25 * prepass.action_verb_fraction
        + (10 if prepass.bullet_lines >= 4 else 0)
    )

    # structure: sections + bullets + word-count band
    structure_score = clamp(
        20
        + 10 * len(prepass.detected_sections)
        + (10 if 200 <= prepass.word_count <= 800 else 0)
        + (10 if prepass.bullet_lines >= 4 else 0)
    )

    # clarity: verb fraction + bullet ratio + length sanity
    clarity_score = clamp(
        25
        + 35 * prepass.action_verb_fraction
        + (15 if 4 <= prepass.bullet_lines <= 25 else 0)
        + (10 if 200 <= prepass.word_count <= 800 else 0)
    )

    # completeness: section coverage + skill coverage
    completeness_score = clamp(
        15
        + 14 * len(prepass.detected_sections)
        + (10 if prepass.word_count >= 200 else 0)
        + (8 if len(prepass.detected_skills) >= 5 else 0)
    )

    return [
        {"key": "keywords", "label": "Keyword alignment", "score": keywords_score},
        {"key": "impact", "label": "Impact evidence", "score": impact_score},
        {"key": "structure", "label": "Structure", "score": structure_score},
        {"key": "clarity", "label": "Clarity", "score": clarity_score},
        {"key": "completeness", "label": "Completeness", "score": completeness_score},
    ]


# Weighted overall (author-selected weights, sum to 1.00). Robustness against the
# specific weight choice is established by the equal-weight sensitivity analysis
# documented in Chapter 4.3.5 of the thesis, not by external recruiter-survey
# citation.
_OVERALL_WEIGHTS = {"keywords": 0.30, "impact": 0.25, "structure": 0.15, "clarity": 0.15, "completeness": 0.15}


def compute_overall_score_v2(score_breakdown: list[dict[str, int | str]]) -> int:
    weighted = 0.0
    for item in score_breakdown:
        key = str(item.get("key", ""))
        score = float(item.get("score", 0))
        weighted += score * _OVERALL_WEIGHTS.get(key, 0.20)
    return int(round(weighted))


def compute_match_score_v2(prepass: ResumePrepassV2) -> int:
    """Match score for the Job Match tool (single integer, 0–100)."""
    if not prepass.matched_keywords and not prepass.missing_keywords:
        return 50  # neutral when no JD context
    coverage = len(prepass.matched_keywords) / max(1, len(prepass.matched_keywords) + len(prepass.missing_keywords))
    weighted = prepass.weighted_keyword_score / 100.0
    bm25_boost = min(1.0, prepass.bm25_keyword_score / 25.0)
    raw = 0.5 * coverage + 0.35 * weighted + 0.15 * bm25_boost
    return int(round(raw * 100))


def confidence_gap_note_v2(heuristic_overall: int, llm_overall: int | None) -> str | None:
    if llm_overall is None:
        return None
    gap = abs(heuristic_overall - llm_overall)
    if gap > 18:
        return (
            f"Heuristic v2 and language-model assessments differ by {gap} points; treat the score "
            "as approximate."
        )
    return None
