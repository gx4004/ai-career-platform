"""Authoritative server-side stop-category classifier (R15 #182, D-095).

This is the SINGLE source of truth for deciding whether a screening/application
field must be a *mandatory stop* — a field the system never drafts, that only the
user's typed input can resolve — versus a field the generator may draft.

ADR 0009 / D-095 make this classification server-authoritative: it is computed
here from the field text alone, so no client-supplied label, flag, or override can
reclassify a field or bypass a stop. The generator (``compose_packet_materials``)
and the packet's listing scan (``compute_unresolved_questions``) both route through
these functions, so there is exactly one classifier — this module absorbs the
provisional stop-topic list #181 shipped inline (work-auth / compensation /
relocation / eligibility), with no second copy anywhere.

The exhaustive stop categories (issue #182):

- ``work_authorization`` — visa / sponsorship / right-to-work status
- ``salary``             — compensation expectations / pay history
- ``relocation``         — willingness to relocate / move
- ``eligibility``        — clearances, background/drug checks, licences, "authorised to work"
- ``demographic``        — citizenship, gender, race, age, disability, veteran, etc.
- ``legal``              — criminal record, non-compete, litigation, bankruptcy
- ``sensitive``          — SSN / passport / bank / medical / other raw PII
- ``uncertain``          — free-form / open-ended fields the model cannot ground

A field is *draftable* only when it matches none of the above.
"""

from __future__ import annotations

from typing import Literal

from app.services.quality_signals import keyword_present

# One closed set, imported by the schema layer so the Pydantic/Zod contract and the
# classifier can never drift apart (D-094).
StopCategory = Literal[
    "work_authorization",
    "salary",
    "relocation",
    "eligibility",
    "demographic",
    "legal",
    "sensitive",
    "uncertain",
]

# Canonical evaluation order. The first category whose terms fire wins when a single
# field is classified, so the more specific work-authorization terms take precedence
# over the broader eligibility terms they overlap with.
STOP_CATEGORIES: tuple[StopCategory, ...] = (
    "work_authorization",
    "salary",
    "relocation",
    "legal",
    "demographic",
    "eligibility",
    "sensitive",
    "uncertain",
)

# Term dictionaries. Matched with :func:`keyword_present` (word-boundary for single
# tokens, substring for phrases), so a term like "age" only fires on the standalone
# word, never inside "manage"/"stage".
_STOP_TERMS: dict[StopCategory, tuple[str, ...]] = {
    "work_authorization": (
        "visa",
        "sponsorship",
        "sponsor",
        "work authorization",
        "work authorisation",
        "work permit",
        "right to work",
        "immigration status",
        "h-1b",
        "h1b",
        "opt status",
        "ead",
    ),
    "salary": (
        "salary",
        "compensation",
        "pay range",
        "expected pay",
        "expected salary",
        "salary expectation",
        "salary expectations",
        "salary history",
        "pay expectation",
        "desired salary",
        "wage",
        "remuneration",
        "current ctc",
        "expected ctc",
    ),
    "relocation": (
        "relocation",
        "relocate",
        "willing to relocate",
        "willing to move",
        "open to relocation",
    ),
    "legal": (
        "criminal",
        "felony",
        "conviction",
        "convicted",
        "non-compete",
        "noncompete",
        "litigation",
        "lawsuit",
        "legal proceedings",
        "bankruptcy",
        "disciplinary action",
    ),
    "demographic": (
        "citizenship",
        "citizen",
        "nationality",
        "national origin",
        "gender",
        "race",
        "ethnicity",
        "ethnic",
        "disability",
        "veteran",
        "marital status",
        "date of birth",
        "religion",
        "sexual orientation",
        "pregnant",
        "pregnancy",
    ),
    "eligibility": (
        "eligibility",
        "eligible to work",
        "authorized to work",
        "authorised to work",
        "legally authorized",
        "legally authorised",
        "security clearance",
        "clearance",
        "background check",
        "drug test",
        "drug screening",
        "driver's license",
        "driving licence",
        "minimum age",
    ),
    "sensitive": (
        "social security",
        "ssn",
        "passport number",
        "national insurance number",
        "bank account",
        "routing number",
        "tax identification",
        "medical history",
        "health condition",
    ),
    "uncertain": (
        "in your own words",
        "tell us about",
        "describe a time",
        "why do you want",
        "open-ended",
        "free response",
        "essay question",
    ),
}

_STOP_QUESTION_TEXT: dict[StopCategory, str] = {
    "work_authorization": "Confirm your work-authorization / visa status for this role (only you can).",
    "salary": "Provide your compensation expectation for this role (only you can).",
    "relocation": "Confirm whether you are willing to relocate for this role (only you can).",
    "eligibility": "Answer the eligibility requirement this listing sets (only you can).",
    "demographic": "This asks for demographic information — answer it yourself if you choose to.",
    "legal": "This asks a legal-history question — only you can answer it.",
    "sensitive": "This asks for sensitive personal information — only you can provide it.",
    "uncertain": "This field needs your own words; the system will not guess it for you.",
}


def classify_stop_category(text: str) -> StopCategory | None:
    """Classify one screening/application field; return its stop category or None.

    Server-authoritative (D-095): derived only from the field text. ``None`` means
    the field is draftable. When a field touches more than one topic the canonical
    :data:`STOP_CATEGORIES` order decides, so overlapping work-authorization vs.
    eligibility phrasing resolves deterministically.
    """
    if not text:
        return None
    for category in STOP_CATEGORIES:
        if any(keyword_present(term, text) for term in _STOP_TERMS[category]):
            return category
    return None


def stop_categories_in(text: str) -> list[StopCategory]:
    """Every stop category a block of text raises, in canonical order (deduped).

    Used to scan a listing description for the mandatory stops it surfaces; a single
    listing can raise several (e.g. both salary and relocation).
    """
    if not text:
        return []
    return [
        category
        for category in STOP_CATEGORIES
        if any(keyword_present(term, text) for term in _STOP_TERMS[category])
    ]


def is_stop_category(value: str) -> bool:
    """True when ``value`` names one of the mandatory-stop categories."""
    return value in STOP_CATEGORIES


def stop_question_text(category: StopCategory) -> str:
    """The canonical, listing-content-free prompt shown for a stop category.

    Deliberately generic so the packet's own ``unresolved_questions`` never copy
    listing or draft text (D-093): the packet owns the derived question, not a copy
    of the source field.
    """
    return _STOP_QUESTION_TEXT[category]
