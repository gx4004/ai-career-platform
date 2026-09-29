"""Autopilot fill policy: which pages may be opened, and what goes into which field.

Pure functions only. The browser work lives in :mod:`.runner`, the per-ATS DOM
knowledge in :mod:`.adapters`. What goes into which field is decided in one
place, :func:`fill_decision`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Literal
from urllib.parse import parse_qs, quote, urlsplit

from app.services.stop_classifier import classify_stop_category

GREENHOUSE_HOSTS = frozenset({"boards.greenhouse.io", "job-boards.greenhouse.io"})
LEVER_HOST = "jobs.lever.co"
ASHBY_HOST = "jobs.ashbyhq.com"
ALLOWED_HOSTS = GREENHOUSE_HOSTS | {LEVER_HOST, ASHBY_HOST}
_UNSUPPORTED = "Autopilot only opens Greenhouse, Lever, or Ashby application pages over https."


class AutofillRefused(Exception):
    """The destination is not a page the experiment may open."""


class AutofillBusy(Exception):
    """This owner already has a fill running."""


def assert_allowed_apply_url(url: str) -> str:
    parts = urlsplit(url or "")
    if (
        parts.scheme != "https"
        or parts.username
        or parts.password
        or parts.port
        or parts.hostname not in ALLOWED_HOSTS
    ):
        raise AutofillRefused(_UNSUPPORTED)
    return url


def is_allowed(url: str | None) -> bool:
    try:
        assert_allowed_apply_url(url or "")
    except AutofillRefused:
        return False
    return True


# ── Form URL: built from the board token and job id, never an employer link ──

_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
_GREENHOUSE_JOB = re.compile(r"[0-9]{1,20}")


def _token(value: str | None, pattern: re.Pattern = _TOKEN) -> str | None:
    return value if value and pattern.fullmatch(value) else None


def _board_and_job(url: str) -> tuple[str, str, str] | None:
    """``(host, board token, job id)`` from a canonical ATS posting or form link."""
    parts = urlsplit(url or "")
    if parts.scheme != "https" or parts.username or parts.port:
        return None
    host = parts.hostname or ""
    segments = [segment for segment in parts.path.split("/") if segment]
    if host in GREENHOUSE_HOSTS:
        query = parse_qs(parts.query)
        if segments[-1:] == ["job_app"]:
            board, job = (query.get("for") or [""])[0], (query.get("token") or [""])[0]
        elif len(segments) == 3 and segments[1] == "jobs":
            board, job = segments[0], segments[2]
        else:
            return None
        job = _token(job, _GREENHOUSE_JOB)
    elif host in {LEVER_HOST, ASHBY_HOST} and len(segments) >= 2:
        board, job = segments[0], _token(segments[1])
    else:
        return None
    board = _token(board)
    return (host, board, job) if board and job else None


def ats_form_url(*candidates: str | None) -> str | None:
    """The hosted application form for the first candidate that names an ATS job.

    Candidates are the listing's attribution URL first, then its apply link.
    Greenhouse ``absolute_url`` often points at the employer's own careers site,
    which the allowlist refuses, so the form is always built from the board
    token and job id: Greenhouse's hosted form (``embed/job_app``, which
    Greenhouse may move to ``job-boards``), Lever ``/apply``, Ashby
    ``/application``.
    """
    for url in candidates:
        found = _board_and_job(url or "")
        if found is None:
            continue
        host, board, job = found
        if host in GREENHOUSE_HOSTS:
            return f"https://boards.greenhouse.io/embed/job_app?for={quote(board)}&token={job}"
        suffix = "apply" if host == LEVER_HOST else "application"
        return f"https://{host}/{quote(board)}/{quote(job)}/{suffix}"
    return None


# ── Materials: the policy's input ──

StandingTopic = Literal[
    "work_authorization", "visa_sponsorship", "notice_period", "salary_expectation", "relocation"
]
STANDING_TOPICS: tuple[StandingTopic, ...] = (
    "work_authorization",
    "visa_sponsorship",
    "notice_period",
    "salary_expectation",
    "relocation",
)


@dataclass
class AutofillMaterials:
    url: str  # the frozen form URL, see ats_form_url
    # Contact details, exactly as the owner typed them in their application details.
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    location: str = ""
    resume_pdf: bytes = b""
    resume_filename: str = "CV.pdf"
    cover_letter: str = ""
    # Drafted screening answers: only ever for questions that are not stops.
    answers: list[tuple[str, str]] = field(default_factory=list)
    # The owner's typed answers to this application's open questions.
    owner_answers: list[tuple[str, str]] = field(default_factory=list)
    # The owner's typed standing answers, by topic, from their application details.
    standing_answers: dict[str, str] = field(default_factory=dict)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


# ── Fill policy: what may go into which field ──


def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def _mentions(text: str, terms: tuple[str, ...]) -> bool:
    """Whole-word (or whole-phrase) match on normalised text."""
    padded = f" {_norm(text)} "
    return any(f" {term} " in padded for term in terms)


# Always the human's act, whatever the owner typed anywhere.
_EEO_TERMS = (
    "gender", "sex", "race", "racial", "ethnicity", "ethnic", "hispanic", "latino",
    "veteran", "disability", "disabled", "sexual orientation", "transgender", "pronoun",
    "pronouns", "self identification", "self identify", "voluntary self", "eeo",
    "equal employment", "equal opportunity", "lgbtq",
)
_CONSENT_TERMS = (
    "consent", "i agree", "agree to", "privacy policy", "privacy notice", "terms",
    "acknowledge", "acknowledgement", "gdpr", "data processing", "i certify", "i confirm",
    "i understand", "i accept",
)
_SKIPPED_TYPES = frozenset({"hidden", "submit", "button", "image", "reset"})
# Controls whose value is one of a fixed set of options.
CHOICE_TYPES = frozenset({"select", "radio", "checkbox", "combobox"})


@dataclass(frozen=True)
class FillDecision:
    """What happens to one form control (or one radio/checkbox group).

    ``source`` names the rule: ``contact:<field>``, ``resume``, ``cover_file``,
    ``cover_text``, ``typed``, ``standing:<topic>``, ``drafted``, ``needs_you``
    or ``never:<why>``. Only a decision with a ``value`` is written. Radios,
    checkboxes and comboboxes would need a click, so an exact option match on
    those becomes ``pick:<rule>``: the option is pointed out and the owner
    picks it.
    """

    source: str
    value: str = ""


_NEEDS_YOU = FillDecision("needs_you")


def standing_topic(label: str) -> StandingTopic | None:
    """Which standing answer, if any, answers this question."""
    category = classify_stop_category(label)
    if _mentions(label, ("sponsor", "sponsorship", "visa")):
        return "visa_sponsorship"
    if category in {"work_authorization", "eligibility"} and _mentions(
        label,
        ("authorized", "authorised", "authorization", "authorisation", "right to work",
         "eligible to work", "work permit", "legally"),
    ):
        return "work_authorization"
    if category == "salary" and not _mentions(
        label, ("current", "history", "previous", "last", "present")
    ):
        return "salary_expectation"
    if category == "relocation":
        return "relocation"
    if _mentions(
        label,
        ("notice period", "notice", "earliest start", "start date", "when can you start",
         "available to start"),
    ):
        return "notice_period"
    return None


def _contact_kind(control: dict) -> str | None:
    """Which contact field a single-line input is, from its name, id and label."""
    key = _norm(f"{control['name']} {control['id']} {control['label']}".replace("_", " "))
    if "first name" in key or "given name" in key:
        return "first_name"
    if "last name" in key or "surname" in key or "family name" in key:
        return "last_name"
    if control["type"] == "email" or re.search(r"\bemail\b", key):
        return "email"
    if control["type"] == "tel" or re.search(r"\b(phone|mobile)\b", key):
        return "phone"
    if "linkedin" in key:
        return "linkedin"
    if re.search(r"\b(website|portfolio|github|personal site)\b", key):
        return "website"
    if re.search(r"\b(city|location)\b", key):
        return "location"
    if control["name"] == "name" or _norm(control["label"]) in {"name", "full name"}:
        return "full_name"
    return None


def _exact_option(value: str, options: list[str]) -> str | None:
    wanted = _norm(value)
    return next((option for option in options if wanted and _norm(option) == wanted), None)


def fill_decision(control: dict, materials: AutofillMaterials) -> FillDecision:
    """The fill policy, for one control (#374, #375).

    - Never: EEO / voluntary self-identification, consent boxes, CAPTCHAs,
      buttons and submit controls, whatever anyone typed.
    - Contact fields come only from the owner's application details.
    - A stop-category question (salary, visa, relocation…) gets only an answer
      the owner typed: this application's answer first, then a standing answer.
    - Drafted answers go only into non-stop free-text questions.
    - Choices (dropdowns, radios, checkboxes, comboboxes) take only an exact
      option match; only a native dropdown is set, the rest are pointed out.
    - The resume goes only into the input the ATS adapter names as the resume.

    ``control`` carries ``tag``, ``type``, ``name``, ``id``, ``label`` and
    ``options``; an adapter may add ``slot`` (``resume``/``cover``) and
    ``contact`` (a contact field it knows by selector).
    """
    tag = control["tag"]
    kind = "select" if tag == "select" else control["type"]
    label = control["label"] or control["name"] or ""
    key = f"{control['name']} {control['id']} {label}".replace("_", " ")
    if kind in _SKIPPED_TYPES:
        return FillDecision("never:control")
    if "captcha" in key.lower():
        return FillDecision("never:captcha")
    if _mentions(key, _EEO_TERMS):
        return FillDecision("never:eeo")
    if _mentions(key, _CONSENT_TERMS):
        return FillDecision("never:consent")
    if kind == "file":
        slot = control.get("slot") or ("cover" if "cover" in _norm(key) else "")
        if slot == "resume" and materials.resume_pdf:
            return FillDecision("resume", "file")
        if slot == "cover" and materials.cover_letter:
            return FillDecision("cover_file", "file")
        return _NEEDS_YOU
    if tag == "textarea" and re.search(r"cover|comments|additional information", _norm(key)):
        if not materials.cover_letter:
            return _NEEDS_YOU
        return FillDecision("cover_text", materials.cover_letter)

    is_stop = classify_stop_category(label) is not None
    is_choice = kind in CHOICE_TYPES
    decision = _NEEDS_YOU
    contact = control.get("contact") or (
        None if (is_stop or tag == "textarea" or kind in {"radio", "checkbox"})
        else _contact_kind(control)
    )
    if contact:
        value = materials.full_name if contact == "full_name" else getattr(materials, contact)
        decision = FillDecision(f"contact:{contact}", value)
    elif (owned := _best_answer(label, materials.owner_answers)) is not None:
        decision = FillDecision("typed", owned)
    elif (topic := standing_topic(label)) and materials.standing_answers.get(topic):
        decision = FillDecision(f"standing:{topic}", materials.standing_answers[topic])
    elif not is_stop and not is_choice:
        drafted = _best_answer(label, materials.answers)
        if drafted is not None:
            decision = FillDecision("drafted", drafted)

    if is_choice and decision.value:
        option = _exact_option(decision.value, control.get("options") or [])
        if option is None:
            return _NEEDS_YOU
        source = decision.source if kind == "select" else f"pick:{decision.source}"
        decision = FillDecision(source, option)
    return decision if decision.value else _NEEDS_YOU


# Words too common to say two questions are the same question.
_FILLER_WORDS = frozenset(
    "a an and are at can do does for have how i if in is it of on or our please "
    "the this to us we what when where which who why will with would you your".split()
)
ANSWER_MATCH_THRESHOLD = 0.8


def _words(text: str) -> frozenset[str]:
    return frozenset(_norm(text).split()) - _FILLER_WORDS


def _match_score(label: str, question: str) -> float:
    """How surely a form label asks the prepared question, from 0 to 1.

    Whole words only, so "age" never matches "language". Near-identical wording
    scores by character similarity; otherwise the shared words must cover both
    sides, or one side's words (two or more) must all appear in the other.
    """
    label_words, question_words = _words(label), _words(question)
    if not label_words or not question_words:
        return 0.0
    shared = label_words & question_words
    overlap = len(shared) / len(label_words | question_words)
    smaller = min(len(label_words), len(question_words))
    if len(shared) == smaller >= 2:  # every word of the shorter one is in the longer
        overlap = max(overlap, ANSWER_MATCH_THRESHOLD + 0.2 * overlap)
    return max(overlap, SequenceMatcher(None, _norm(label), _norm(question)).ratio())


def _best_answer(label: str, answers: list[tuple[str, str]]) -> str | None:
    best_score, best_answer = 0.0, None
    for question, answer in answers:
        score = _match_score(label, question)
        if score >= ANSWER_MATCH_THRESHOLD and score > best_score:
            best_score, best_answer = score, answer
    return best_answer
