"""Strong heuristic v3 — Stage H ablation extension of v2.

Adds five focused enhancements on top of the v2 classical-IR baseline so the
Chapter 4 ablation can attribute the residual gap between heuristic and LLM-only
modes to specific signal classes:

    H.1 SBERT semantic fallback (keywords axis)
        Cascade: exact -> fuzzy(0.85) -> ESCO -> SBERT(cos>=0.65) -> OOV skip.
        Sentence-transformers all-MiniLM-L6-v2, lazy singleton, per-pair cache.
    H.2 STAR-format detection (impact axis)
        Per resume bullet, score 0-4 STAR points (Situation/Task/Action/Result).
        star_score = mean(bullet_points) * 25, normalised to [0, 100].
    H.3 Cross-axis coherence checks (completeness axis)
        C1 years-claimed vs date-supported, C2 orphan-skill, C3 education vs
        years-claimed. Stdlib only (re, datetime).
    H.4 Bigram / trigram phrase matching (keywords axis)
        n-gram tokenisation (n=1,2,3). Bigram weight 1.5x, trigram 2.0x.
        Sliding-window fallback when adjacent match fails.
    H.5 ESCO taxonomy expansion (keywords axis)
        Loads `esco_skills_expanded.json` when ESCO_VARIANT=expanded; otherwise
        defaults to the baseline 107-entry file. Same schema as v2.

This module never replaces v2. The two coexist: v2 stays for ablation
comparison, v3 is selected by the eval harness and (optionally, future) by
HEURISTIC_VERSION=v3 at the call sites. v3 is NOT wired into the production
runtime; production stays on v2 for the supervisor draft.

`build_resume_prepass_v3(..., features=...)` accepts an explicit feature-flag
set so the eval harness can compute every cell of the ablation table from a
single module without forking the file. Each ablation cell is a controlled
strict subset of the H.1..H.5 enhancement bag; the v3-full cell is the union.

Heavy deps (sentence-transformers, torch) are imported lazily so unit tests
that exercise only the deterministic enhancements (H.2..H.5) do not pay the
import cost.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence

# v2 internals reused intentionally — v3 is an extension, not a fork.
# NOTE: do NOT `from ... import _corpus_idf_override` — that captures the
# value at import time, but `set_corpus_idf` rebinds the global inside v2,
# so a copied reference would silently miss the runtime install. Read it
# through `_v2_module.get_active_idf()` instead.
from app.services import quality_signals_v2 as _v2_module  # noqa: E402
from app.services.quality_signals_v2 import (  # noqa: E402
    _ACTION_VERBS_PATH,
    _BM25_B,
    _BM25_K1,
    _BULLET_RE,
    _DEFAULT_AVG_DL,
    _FUZZY_THRESHOLD,
    _MIN_ESCO_VARIANT_LEN,
    _QUANT_RE,
    _SECTION_WEIGHTS,
    _bm25_score,
    _detect_sections,
    _fuzzy_match,
    _load_action_verbs,
    _section_for_offset,
    _tokenize,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature flags — ablation control
# ---------------------------------------------------------------------------

FEATURE_NGRAM = "ngram"          # H.4
FEATURE_ESCO_EXPANDED = "esco"   # H.5
FEATURE_STAR = "star"            # H.2
FEATURE_COHERENCE = "coherence"  # H.3
FEATURE_SBERT = "sbert"          # H.1

ALL_FEATURES = frozenset({
    FEATURE_NGRAM, FEATURE_ESCO_EXPANDED, FEATURE_STAR, FEATURE_COHERENCE, FEATURE_SBERT,
})

# ---------------------------------------------------------------------------
# H.5 — ESCO expansion loader
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_ESCO_BASELINE_PATH = _DATA_DIR / "esco_skills.json"
_ESCO_EXPANDED_PATH = _DATA_DIR / "esco_skills_expanded.json"


@lru_cache(maxsize=2)
def _load_esco_variant(use_expanded: bool) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Return (variant_to_canonical, canonical_to_variants) for the requested variant.

    The expanded variant is opt-in: it must be explicitly requested either via
    the `features` set passed to `build_resume_prepass_v3` or via
    ESCO_VARIANT=expanded at the environment level. The baseline 107-entry
    file remains the default to preserve back-compatibility with v2 numbers.
    """
    path = _ESCO_EXPANDED_PATH if use_expanded else _ESCO_BASELINE_PATH
    if not path.exists():
        if use_expanded:
            logger.warning(
                "Expanded ESCO file missing at %s; falling back to baseline.", path,
            )
            return _load_esco_variant(False)
        logger.warning("Baseline ESCO file missing at %s.", path)
        return {}, {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    skills = payload.get("skills", [])
    variant_to_canonical: dict[str, str] = {}
    canonical_to_variants: dict[str, list[str]] = {}
    for entry in skills:
        canonical = str(entry.get("canonical", "")).strip()
        if not canonical:
            continue
        raw_variants = [str(v).strip().lower() for v in entry.get("variants", []) if v]
        variants = [
            v for v in raw_variants
            if len(v) >= _MIN_ESCO_VARIANT_LEN or not v.isalpha()
        ]
        canonical_to_variants[canonical] = variants
        for v in variants:
            variant_to_canonical[v] = canonical
        if len(canonical) >= _MIN_ESCO_VARIANT_LEN or not canonical.isalpha():
            variant_to_canonical[canonical.lower()] = canonical
    return variant_to_canonical, canonical_to_variants


def _esco_use_expanded(features: frozenset[str] | set[str] | None) -> bool:
    """Decide which ESCO variant to use for this call.

    Resolution order: explicit feature flag wins; otherwise honour the env var
    ESCO_VARIANT=expanded; otherwise default to baseline.
    """
    if features and FEATURE_ESCO_EXPANDED in features:
        return True
    return os.environ.get("ESCO_VARIANT", "").strip().lower() == "expanded"


# ---------------------------------------------------------------------------
# H.4 — Bigram / trigram phrase matching
# ---------------------------------------------------------------------------

_PHRASE_BIGRAM_WEIGHT = 1.5
_PHRASE_TRIGRAM_WEIGHT = 2.0
_PHRASE_WINDOW = 5  # token window for non-adjacent fallback


def _ngrams(tokens: Sequence[str], n: int) -> list[tuple[str, ...]]:
    """Return the list of n-grams (positional) over `tokens`."""
    if n <= 0 or len(tokens) < n:
        return []
    return [tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


def _phrase_match_with_window(
    target_tokens: Sequence[str],
    resume_tokens: Sequence[str],
    window: int = _PHRASE_WINDOW,
) -> bool:
    """Return True if all target_tokens occur within a sliding window in resume_tokens.

    The exact n-gram match is checked first by the caller; this fallback handles
    near-adjacent occurrences (e.g. "machine" then "learning" within five
    tokens of each other) so that legitimate phrase evidence is not lost when
    the resume rephrases without altering the underlying claim.
    """
    if not target_tokens or len(target_tokens) > len(resume_tokens):
        return False
    target_set = set(target_tokens)
    needed = len(target_set)
    if needed == 1:
        return target_tokens[0] in resume_tokens
    for i in range(len(resume_tokens) - needed + 1):
        seen = set()
        for j in range(i, min(i + window, len(resume_tokens))):
            if resume_tokens[j] in target_set:
                seen.add(resume_tokens[j])
            if len(seen) == needed:
                return True
    return False


def _phrase_evidence_score(
    jd_tokens: Sequence[str],
    resume_tokens: Sequence[str],
) -> float:
    """Compute a 0..1 phrase-evidence score across bigrams and trigrams.

    Returns the share of JD bigrams + trigrams (weighted 1.5x and 2.0x) that
    are matched in the resume. Stop-word-only phrases are filtered to avoid
    reward inflation from generic phrasing ("of the", "and the").
    """
    stop = {"the", "a", "an", "of", "and", "or", "to", "for", "with", "in", "on",
            "at", "by", "from", "as", "is", "are", "be", "this", "that"}

    def _useful(ng: tuple[str, ...]) -> bool:
        return any(t not in stop for t in ng)

    resume_set_2 = set(_ngrams(resume_tokens, 2))
    resume_set_3 = set(_ngrams(resume_tokens, 3))

    jd_bigrams = [g for g in _ngrams(jd_tokens, 2) if _useful(g)]
    jd_trigrams = [g for g in _ngrams(jd_tokens, 3) if _useful(g)]

    matches = 0.0
    total = 0.0
    for g in jd_bigrams:
        total += _PHRASE_BIGRAM_WEIGHT
        if g in resume_set_2 or _phrase_match_with_window(g, resume_tokens):
            matches += _PHRASE_BIGRAM_WEIGHT
    for g in jd_trigrams:
        total += _PHRASE_TRIGRAM_WEIGHT
        if g in resume_set_3 or _phrase_match_with_window(g, resume_tokens):
            matches += _PHRASE_TRIGRAM_WEIGHT

    return matches / total if total else 0.0


def _phrase_term_match(jd_term: str, resume_tokens: Sequence[str]) -> bool:
    """Check whether a multi-word JD term matches as a phrase in resume_tokens.

    The term is tokenised with the same tokeniser used for the resume so
    intra-token punctuation (`react.js`) survives. Single-word terms fall back
    to plain set membership.
    """
    term_tokens = tuple(_tokenize(jd_term))
    if not term_tokens:
        return False
    if len(term_tokens) == 1:
        return term_tokens[0] in resume_tokens
    n = len(term_tokens)
    if n > 3:
        return _phrase_match_with_window(term_tokens, resume_tokens, window=n + 2)
    resume_set = set(_ngrams(resume_tokens, n))
    if term_tokens in resume_set:
        return True
    return _phrase_match_with_window(term_tokens, resume_tokens)


# ---------------------------------------------------------------------------
# H.2 — STAR-format detection (impact axis)
# ---------------------------------------------------------------------------

# Situation cues — context phrases setting the scene.
_STAR_S_RE = re.compile(
    r"\b(when|while|during|amid|under|in the|in our|at the|across|as part of|"
    r"in response to|in the wake of|following|after|despite|given)\b",
    re.IGNORECASE,
)

# Task cues — explicit goal statement.
_STAR_T_RE = re.compile(
    r"\b(to (?:reduce|increase|improve|lower|raise|cut|grow|scale|build|design|"
    r"implement|launch|deliver|drive|enable|migrate|automate|simplify|consolidate|"
    r"establish|ship|introduce|optimise|optimize|standardise|standardize|reorganise|"
    r"reorganize|refactor|deprecate)|"
    r"goal was to|aimed to|tasked with|asked to|charged with|targeted (?:a|an))\b",
    re.IGNORECASE,
)

# Action cues — bullet starts with an action verb. We reuse the existing
# action-verb dictionary loaded by v2 so the two stay in sync.

# Result cues — quantified outcome. Reuse v2's quantification regex; STAR R
# also accepts qualitative result markers like "resulting in", "led to".
_STAR_R_QUAL_RE = re.compile(
    r"\b(resulting in|leading to|which (?:reduced|increased|improved|cut|saved|"
    r"raised|grew|enabled|drove)|that (?:reduced|increased|improved|cut)|"
    r"thereby (?:reducing|increasing|improving|cutting|saving)|"
    r"earning|recognised|recognized)\b",
    re.IGNORECASE,
)


def _star_score_for_bullet(bullet: str, action_verbs: frozenset[str]) -> int:
    """Score a single bullet 0..4 on STAR coverage.

    Each STAR axis contributes one point. Action is detected by checking the
    first non-empty token against the bundled action-verb dictionary; the
    other three are regex-based.
    """
    text = bullet.strip()
    if not text:
        return 0
    score = 0
    if _STAR_S_RE.search(text):
        score += 1
    if _STAR_T_RE.search(text):
        score += 1
    # Action: first token in action_verbs.
    first = text.split()[0].lower().rstrip(".,;:!?/") if text.split() else ""
    if action_verbs and first in action_verbs:
        score += 1
    if _QUANT_RE.search(text) or _STAR_R_QUAL_RE.search(text):
        score += 1
    return score


def _star_aggregate_score(bullets: Iterable[str], action_verbs: frozenset[str]) -> float:
    """Aggregate STAR score across all bullets, normalised to [0, 100].

    Per-bullet scores are 0..4; the mean across bullets times 25 yields a
    [0, 100] aggregate. Empty input returns 0.0.
    """
    scores = [_star_score_for_bullet(b, action_verbs) for b in bullets if b.strip()]
    if not scores:
        return 0.0
    return (sum(scores) / len(scores)) * 25.0


# ---------------------------------------------------------------------------
# H.3 — Cross-axis coherence checks
# ---------------------------------------------------------------------------

_YEARS_CLAIMED_RE = re.compile(
    r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b(?:\s*(?:of)?\s*(?:professional|industry|"
    r"hands-on|hands on)?\s*experience)?",
    re.IGNORECASE,
)
_DATE_RANGE_RE = re.compile(
    r"\b(20\d{2})\s*[–—\-‐−to/]+\s*(20\d{2}|present|current|now)\b",
    re.IGNORECASE,
)
_GRAD_RE = re.compile(
    r"\b(?:graduated|received|earned|completed)\b[^.\n]{0,80}\b(20\d{2})\b",
    re.IGNORECASE,
)
_BARE_GRAD_RE = re.compile(
    r"\b(?:b\.?sc\.?|m\.?sc\.?|bachelor|master|phd|degree|university|institute|"
    r"college|engineering|computer science|cs)\b[^.\n]{0,120}?\b(20\d{2})\b",
    re.IGNORECASE,
)


def _years_claimed_from_text(text: str) -> int | None:
    """Return the largest 'N years experience' claim, or None when absent."""
    matches = [int(m.group(1)) for m in _YEARS_CLAIMED_RE.finditer(text or "")]
    return max(matches) if matches else None


def _years_supported_by_dates(text: str) -> int:
    """Sum the duration of all date ranges in the text, in years.

    'present' / 'current' / 'now' resolve to the current calendar year.
    Overlapping ranges are summed naively (i.e., total person-years rather
    than calendar-time-elapsed) because resumes often list parallel roles.
    Negative or zero spans are ignored.
    """
    if not text:
        return 0
    now_year = datetime.utcnow().year
    total = 0
    for m in _DATE_RANGE_RE.finditer(text):
        start_s, end_s = m.group(1), m.group(2)
        try:
            start = int(start_s)
        except ValueError:
            continue
        if end_s.isdigit():
            end = int(end_s)
        else:
            end = now_year
        span = end - start
        if span > 0:
            total += span
    return total


def _orphan_skills(detected_skills: Iterable[str], experience_text: str) -> list[str]:
    """Return skills present in the resume's skill set but absent from any
    experience or projects passage.

    A skill is considered grounded if any of its lowercase form, its hyphen-
    stripped form, or its first significant token surfaces inside the
    experience prose. This is intentionally generous to avoid false-positive
    orphan flags on legitimate but rephrased mentions ("PostgreSQL" in skills,
    "Postgres database" in experience).
    """
    if not experience_text:
        return list(detected_skills)
    haystack = experience_text.lower()
    orphans: list[str] = []
    for skill in detected_skills:
        s = skill.lower()
        first_tok = s.split()[0] if s.split() else ""
        if s in haystack:
            continue
        if first_tok and len(first_tok) >= 4 and first_tok in haystack:
            continue
        # Hyphen-stripped form.
        flat = s.replace("-", "").replace(".", "").replace("_", "")
        if flat and flat in haystack.replace("-", "").replace(".", "").replace("_", ""):
            continue
        orphans.append(skill)
    return orphans


def _education_year(text: str) -> int | None:
    """Best-effort graduation year extraction."""
    if not text:
        return None
    m = _GRAD_RE.search(text)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    m = _BARE_GRAD_RE.search(text)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return None


@dataclass
class CoherencePenalty:
    years_mismatch: int = 0      # absolute year delta (claimed vs supported)
    orphan_skills: list[str] = field(default_factory=list)
    education_mismatch: bool = False
    total_penalty: float = 0.0   # subtracted from completeness sub-score


def _compute_coherence(
    text: str,
    detected_skills: Iterable[str],
    experience_text: str | None = None,
) -> CoherencePenalty:
    """Compute Stage H.3 cross-axis coherence penalties.

    C1 — claimed years vs date-supported years; mismatch > 1 year => -10.
    C2 — orphan skills (skills section but no experience grounding) => -2 each.
    C3 — education year vs claimed years; e.g. graduated 2024 + claims 7
         years experience => -10.

    `experience_text` should be the Experience + Projects passage with the
    Skills-section listing excluded; falling back to the full text would
    make every listed skill count as grounded by definition.
    """
    pen = CoherencePenalty()

    claimed = _years_claimed_from_text(text)
    supported = _years_supported_by_dates(text)
    if claimed is not None and abs(claimed - supported) > 1:
        pen.years_mismatch = abs(claimed - supported)
        pen.total_penalty += 10.0

    orphans = _orphan_skills(detected_skills, experience_text if experience_text is not None else text)
    pen.orphan_skills = orphans
    pen.total_penalty += min(20.0, 2.0 * len(orphans))  # cap at -20

    grad_year = _education_year(text)
    if grad_year is not None and claimed is not None:
        years_since_grad = max(0, datetime.utcnow().year - grad_year)
        if claimed - years_since_grad > 2:
            pen.education_mismatch = True
            pen.total_penalty += 10.0

    return pen


# ---------------------------------------------------------------------------
# H.1 — SBERT semantic fallback
# ---------------------------------------------------------------------------

_SBERT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_SBERT_THRESHOLD = 0.65
_sbert_singleton = None  # lazy-loaded SentenceTransformer instance


def _get_sbert():
    """Return the SBERT model instance, loading it on first call.

    Uses the TRANSFORMERS_NO_TF=1 / USE_TF=0 env guards to avoid the
    Keras-3 vs transformers TF backend conflict that surfaces in environments
    where Keras 3 is installed alongside huggingface transformers without the
    tf-keras shim. PyTorch backend is used regardless.
    """
    global _sbert_singleton
    if _sbert_singleton is not None:
        return _sbert_singleton
    os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
    os.environ.setdefault("USE_TF", "0")
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _sbert_singleton = SentenceTransformer(_SBERT_MODEL_NAME)
        logger.info("Loaded SBERT model %s", _SBERT_MODEL_NAME)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "SBERT load failed (%s); H.1 falls back to no-op semantic match.", exc,
        )
        _sbert_singleton = False  # sentinel: model unavailable
    return _sbert_singleton


def _cosine(a, b) -> float:
    """Cosine similarity for two vectors (numpy arrays or lists)."""
    import numpy as np  # local import; numpy is a transitive dep via sklearn.
    av = np.asarray(a, dtype=float)
    bv = np.asarray(b, dtype=float)
    na = float((av * av).sum() ** 0.5)
    nb = float((bv * bv).sum() ** 0.5)
    if na == 0 or nb == 0:
        return 0.0
    return float((av * bv).sum() / (na * nb))


@dataclass
class _SbertCache:
    """Per-call cache of SBERT encodings to avoid re-encoding the same string."""
    encoded: dict[str, object] = field(default_factory=dict)


def _sbert_match(
    target: str,
    candidates: Iterable[str],
    cache: _SbertCache,
    threshold: float = _SBERT_THRESHOLD,
) -> bool:
    """Return True if any candidate has SBERT cosine similarity >= threshold.

    The model is shared across calls (lazy singleton). Encodings are cached
    per call (one SbertCache instance per `build_resume_prepass_v3` invocation)
    so a JD that hits SBERT for several missing skills only encodes the
    resume vocabulary once.
    """
    model = _get_sbert()
    if not model:  # False sentinel = model unavailable; fail closed.
        return False
    cands = list(dict.fromkeys(c for c in candidates if c))
    if not cands:
        return False
    cands = cands[:200]

    def _encode(s: str):
        if s in cache.encoded:
            return cache.encoded[s]
        v = model.encode(s, show_progress_bar=False, convert_to_numpy=True)
        cache.encoded[s] = v
        return v

    target_vec = _encode(target.lower())
    for c in cands:
        if _cosine(target_vec, _encode(c.lower())) >= threshold:
            return True
    return False


# ---------------------------------------------------------------------------
# Public dataclass — superset of v2's
# ---------------------------------------------------------------------------


@dataclass
class ResumePrepassV3:
    detected_sections: list[str] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)
    detected_skills: list[str] = field(default_factory=list)
    quantified_bullets: int = 0
    bullet_lines: int = 0
    word_count: int = 0
    target_role_label: str | None = None

    # v2 fields preserved
    bm25_keyword_score: float = 0.0
    weighted_keyword_score: float = 0.0
    action_verb_fraction: float = 0.0
    fuzzy_match_count: int = 0

    # v3-specific
    star_score: float = 0.0
    coherence_penalty: float = 0.0
    coherence_orphans: list[str] = field(default_factory=list)
    coherence_years_mismatch: int = 0
    coherence_education_mismatch: bool = False
    phrase_evidence_score: float = 0.0
    sbert_match_count: int = 0
    ngram_match_count: int = 0
    esco_variant: str = "baseline"
    features_active: list[str] = field(default_factory=list)

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
            "star_score": round(self.star_score, 3),
            "coherence_penalty": round(self.coherence_penalty, 3),
            "coherence_orphans": list(self.coherence_orphans),
            "coherence_years_mismatch": self.coherence_years_mismatch,
            "coherence_education_mismatch": self.coherence_education_mismatch,
            "phrase_evidence_score": round(self.phrase_evidence_score, 3),
            "sbert_match_count": self.sbert_match_count,
            "ngram_match_count": self.ngram_match_count,
            "esco_variant": self.esco_variant,
            "features_active": list(self.features_active),
        }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def _normalise_skills_v3(text: str, variant_to_canonical: dict[str, str]) -> set[str]:
    text_lower = text.lower()
    found: set[str] = set()
    for variant, canonical in variant_to_canonical.items():
        if re.search(rf"(?<![a-z0-9]){re.escape(variant)}(?![a-z0-9])", text_lower):
            found.add(canonical)
    return found


def _best_section_for_canonical_v3(
    canonical: str,
    text_lower: str,
    sections: dict[str, list[tuple[int, int]]],
    canonical_to_variants: dict[str, list[str]],
) -> str | None:
    forms = list(canonical_to_variants.get(canonical, []))
    canonical_lower = canonical.lower()
    if len(canonical_lower) >= _MIN_ESCO_VARIANT_LEN or not canonical_lower.isalpha():
        forms.insert(0, canonical_lower)
    best_section: str | None = None
    best_weight = -1.0
    default_weight = _SECTION_WEIGHTS["_default"]
    for form in forms:
        if not form:
            continue
        pattern = rf"(?<![a-z0-9]){re.escape(form)}(?![a-z0-9])"
        for m in re.finditer(pattern, text_lower):
            section = _section_for_offset(m.start(), sections)
            weight = _SECTION_WEIGHTS.get(section or "_default", default_weight)
            if weight > best_weight:
                best_weight = weight
                best_section = section
    return best_section


def _experience_text_for_coherence(text: str, sections: dict[str, list[tuple[int, int]]]) -> str:
    """Slice the experience + projects passages out of the resume.

    Used by H.3 to compute orphan-skill grounding without contaminating the
    check with the literal Skills-section listing (which would always count as
    grounding by definition).
    """
    if not text:
        return ""
    parts: list[str] = []
    for name in ("Experience", "Projects"):
        for start, end in sections.get(name, []):
            parts.append(text[start:end])
    if parts:
        return "\n".join(parts)
    # Fallback: everything outside Skills.
    skill_ranges = sections.get("Skills", [])
    if not skill_ranges:
        return text
    out = []
    cursor = 0
    for start, end in sorted(skill_ranges):
        out.append(text[cursor:start])
        cursor = end
    out.append(text[cursor:])
    return "".join(out)


def build_resume_prepass_v3(
    resume_text: str,
    job_description: str | None = None,
    target_role_label: str | None = None,
    *,
    corpus_idf: dict[str, float] | None = None,
    features: frozenset[str] | set[str] | None = None,
) -> ResumePrepassV3:
    """Build the v3 prepass output for a (resume, JD) pair.

    `features` selects which Stage H enhancements are active. Pass
    `ALL_FEATURES` for the v3-full configuration; pass an empty set or None
    to fall back to a v2-equivalent pipeline (used as ablation baseline cell).
    """
    feats = frozenset(features) if features is not None else frozenset()

    text = resume_text or ""
    text_lower = text.lower()
    sections = _detect_sections(text)
    bullets = [m.group(1) for m in _BULLET_RE.finditer(text)]
    tokens = _tokenize(text)
    unique_tokens = set(tokens)

    # H.5 — pick ESCO variant
    use_expanded = _esco_use_expanded(feats)
    variant_to_canonical, canonical_to_variants = _load_esco_variant(use_expanded)
    esco_variant_label = "expanded" if use_expanded and _ESCO_EXPANDED_PATH.exists() else "baseline"

    # Auto-derive target role label from JD if absent.
    if target_role_label is None and job_description:
        try:
            from app.services.quality_signals import extract_role_label
            target_role_label = extract_role_label(job_description) or None
        except Exception:  # noqa: BLE001
            target_role_label = None

    resume_skills = _normalise_skills_v3(text, variant_to_canonical)

    matched: list[str] = []
    missing: list[str] = []
    matched_locations: list[tuple[str, str | None]] = []
    fuzzy_count = 0
    sbert_count = 0
    ngram_count = 0
    sbert_cache = _SbertCache()

    if job_description:
        jd_skills = _normalise_skills_v3(job_description, variant_to_canonical)
        for skill in sorted(jd_skills):
            skill_lower = skill.lower()
            in_resume_skills = skill in resume_skills
            in_tokens = (
                skill_lower in unique_tokens
                and skill_lower in variant_to_canonical
            )
            if in_resume_skills or in_tokens:
                matched.append(skill)
                section = _best_section_for_canonical_v3(
                    skill, text_lower, sections, canonical_to_variants,
                )
                matched_locations.append((skill, section))
                continue

            # H.4 — phrase-evidence fallback before fuzzy.
            if FEATURE_NGRAM in feats:
                if _phrase_term_match(skill, tokens):
                    matched.append(skill)
                    matched_locations.append((skill, None))
                    ngram_count += 1
                    continue

            # Fuzzy fallback (v2 behaviour, preserved).
            if (
                len(skill_lower) >= _MIN_ESCO_VARIANT_LEN or not skill_lower.isalpha()
            ) and _fuzzy_match(skill, unique_tokens):
                matched.append(skill)
                matched_locations.append((skill, None))
                fuzzy_count += 1
                continue

            # H.1 — SBERT semantic fallback.
            if FEATURE_SBERT in feats:
                if _sbert_match(skill, list(unique_tokens), sbert_cache):
                    matched.append(skill)
                    matched_locations.append((skill, None))
                    sbert_count += 1
                    continue

            missing.append(skill)

    # BM25 (v2 behaviour, unchanged).
    resume_tf: dict[str, int] = {}
    for tok in tokens:
        resume_tf[tok] = resume_tf.get(tok, 0) + 1
    jd_tokens = _tokenize(job_description or "")
    if corpus_idf is not None:
        idf_table = corpus_idf
    else:
        # Read live override-or-baseline through the v2 module so a
        # `set_corpus_idf(...)` call from the eval harness is honoured.
        # See module-top NOTE on why a direct import would silently fail.
        idf_table = _v2_module.get_active_idf()
    bm25 = _bm25_score(resume_tf, jd_tokens, idf_table)

    weighted = _weighted_match_score_v3(
        matched_locations, total_required=len(matched) + len(missing),
    )

    action_verbs = _load_action_verbs()
    starts = [b.strip().split()[0].lower().rstrip(".,") for b in bullets if b.strip()]
    if starts and action_verbs:
        verb_hits = sum(1 for w in starts if w in action_verbs)
        action_fraction = verb_hits / len(starts)
    else:
        action_fraction = 0.0

    # H.2 — STAR aggregate score.
    star_score = (
        _star_aggregate_score(bullets, action_verbs)
        if FEATURE_STAR in feats else 0.0
    )

    # H.3 — coherence penalty. The orphan-skill check needs the experience
    # passage, not the full resume — otherwise the Skills-section listing
    # itself would always count as grounding by definition.
    if FEATURE_COHERENCE in feats:
        experience_text = _experience_text_for_coherence(text, sections)
        coh = _compute_coherence(text, resume_skills, experience_text=experience_text)
    else:
        coh = CoherencePenalty()

    # H.4 — phrase-evidence aggregate (informational; impacts keywords axis).
    phrase_score = (
        _phrase_evidence_score(jd_tokens, tokens)
        if FEATURE_NGRAM in feats and jd_tokens else 0.0
    )

    return ResumePrepassV3(
        detected_sections=list(sections.keys()),
        matched_keywords=matched,
        missing_keywords=missing,
        detected_skills=sorted(resume_skills),
        quantified_bullets=sum(1 for b in bullets if _QUANT_RE.search(b)),
        bullet_lines=len(bullets),
        word_count=len(tokens),
        target_role_label=target_role_label,
        bm25_keyword_score=bm25,
        weighted_keyword_score=weighted,
        action_verb_fraction=action_fraction,
        fuzzy_match_count=fuzzy_count,
        star_score=star_score,
        coherence_penalty=coh.total_penalty,
        coherence_orphans=list(coh.orphan_skills),
        coherence_years_mismatch=coh.years_mismatch,
        coherence_education_mismatch=coh.education_mismatch,
        phrase_evidence_score=phrase_score,
        sbert_match_count=sbert_count,
        ngram_match_count=ngram_count,
        esco_variant=esco_variant_label,
        features_active=sorted(feats),
    )


def _weighted_match_score_v3(
    matched_locations: list[tuple[str, str | None]],
    total_required: int,
) -> float:
    if total_required == 0:
        return 0.0
    achieved = 0.0
    for _, section in matched_locations:
        weight = _SECTION_WEIGHTS.get(section or "_default", _SECTION_WEIGHTS["_default"])
        achieved += weight
    max_achievable = total_required * _SECTION_WEIGHTS["Skills"]
    return min(100.0, (achieved / max_achievable) * 100.0)


# ---------------------------------------------------------------------------
# Score combination — v3 sub-axes
# ---------------------------------------------------------------------------


def compute_resume_breakdown_v3(prepass: ResumePrepassV3) -> list[dict[str, int | str]]:
    """Five-axis breakdown using the v3 signals.

    H.4 / H.5 / H.1 affect the *keywords* axis indirectly through additional
    successful matches and the phrase-evidence boost.
    H.2 contributes a STAR sub-component to *impact*.
    H.3 deducts from *completeness* via the coherence penalty.
    """
    def clamp(v: float) -> int:
        return int(round(max(0.0, min(100.0, v))))

    if not prepass.matched_keywords and not prepass.missing_keywords:
        keywords_score = clamp(36 + len(prepass.detected_skills) * 7)
    else:
        # v2 base + phrase boost (H.4) capped at +10 so phrase-evidence cannot
        # dominate the BM25 + weighted-coverage baseline alone.
        base = (
            0.7 * prepass.weighted_keyword_score
            + 0.3 * min(100.0, prepass.bm25_keyword_score * 4)
        )
        phrase_boost = min(10.0, prepass.phrase_evidence_score * 30.0)
        keywords_score = clamp(base + phrase_boost)

    # Impact: v2 base + STAR component (H.2).
    impact_base = (
        20
        + 12 * math.log2(1 + prepass.quantified_bullets)
        + 25 * prepass.action_verb_fraction
        + (10 if prepass.bullet_lines >= 4 else 0)
    )
    if prepass.star_score > 0:
        # Convex blend: 0.6 base, 0.4 STAR — ensures STAR-rich resumes lift
        # impact without erasing the v2 quantification signal.
        impact_score = clamp(0.6 * impact_base + 0.4 * prepass.star_score)
    else:
        impact_score = clamp(impact_base)

    structure_score = clamp(
        20
        + 10 * len(prepass.detected_sections)
        + (10 if 200 <= prepass.word_count <= 800 else 0)
        + (10 if prepass.bullet_lines >= 4 else 0)
    )

    clarity_score = clamp(
        25
        + 35 * prepass.action_verb_fraction
        + (15 if 4 <= prepass.bullet_lines <= 25 else 0)
        + (10 if 200 <= prepass.word_count <= 800 else 0)
    )

    completeness_base = (
        15
        + 14 * len(prepass.detected_sections)
        + (10 if prepass.word_count >= 200 else 0)
        + (8 if len(prepass.detected_skills) >= 5 else 0)
    )
    completeness_score = clamp(completeness_base - prepass.coherence_penalty)

    return [
        {"key": "keywords", "label": "Keyword alignment", "score": keywords_score},
        {"key": "impact", "label": "Impact evidence", "score": impact_score},
        {"key": "structure", "label": "Structure", "score": structure_score},
        {"key": "clarity", "label": "Clarity", "score": clarity_score},
        {"key": "completeness", "label": "Completeness", "score": completeness_score},
    ]


_OVERALL_WEIGHTS_V3 = {
    "keywords": 0.30, "impact": 0.25, "structure": 0.15,
    "clarity": 0.15, "completeness": 0.15,
}


def compute_overall_score_v3(score_breakdown: list[dict[str, int | str]]) -> int:
    weighted = 0.0
    for item in score_breakdown:
        key = str(item.get("key", ""))
        score = float(item.get("score", 0))
        weighted += score * _OVERALL_WEIGHTS_V3.get(key, 0.20)
    return int(round(max(0.0, min(100.0, weighted))))
