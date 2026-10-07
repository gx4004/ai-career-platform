"""Deterministic, schema-valid LLM fixtures for ``LLM_PROVIDER=fake``.

Vertex is not configured on a local checkout, so running any tool locally with
the real provider fails closed (or, for Resume/Job Match, silently degrades to
the heuristic-only fallback). This module gives local development and demos a
believable stand-in: every caller's prompt shape is matched by a small marker
substring each prompt builder already puts at the top of its system prompt
(see ``app/prompts/*.py`` and the inline system prompts in
``app/services/{cv_tailoring,cv_quality,application_drafts}.py``), and the
matching builder below returns realistic, schema-valid JSON built from the
caller's own ``user_prompt`` content where that content is available (e.g.
CV Studio tailoring must cite the entry text verbatim, so the fixture reads it
back out of the prompt instead of inventing text).

Output is a pure function of the prompt: headline, verdict, issues, keywords,
role/company, quoted resume facts, confirmed Evidence Profile facts and the
regenerate feedback are all read back from the caller's own input, so two
different resumes or postings never produce the same text, and the same input
always produces the same output. Where a prompt carries a locked heuristic
(score, verdict, baseline directions or projects) the fixture agrees with it
rather than contradicting it.

Every builder here returns data shaped to pass the *real* service-side
normalization/validation in the corresponding ``app/services/*.py`` module —
not a raw echo of the prompt. Nothing here marks a run as degraded: callers
that fall back to heuristics only do so when ``complete_structured`` raises,
and this provider never raises for a prompt it recognizes.

Marker-substring dispatch (not a passed-in caller hint) was chosen because
``tests/e2e_server.py`` already monkeypatches ``complete_structured`` directly
on each service module for its own deterministic-provider needs, so nothing
here can assume every caller threads a hint through; the system prompt is the
one thing every caller already provides unprompted.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.services.job_posting import posting_header as _job_header
from app.services.quality_signals import (
    evidence_line,
    extract_job_keywords,
    extract_role_label,
    keyword_present,
)

# ---------------------------------------------------------------------------
# Prompt-parsing helpers
#
# Every builder below reconstructs just enough of the caller's own input
# (locked payload, prepass evidence, structured CV sections, ...) from the
# user_prompt string to produce a response that survives that caller's
# normalization/validation. Callers embed these as ``json.dumps(..., indent=2)``
# blocks after a "## Heading" marker; a compact regex range can't span nested
# braces reliably, so a real JSON decoder is used instead.
# ---------------------------------------------------------------------------


def _json_after(text: str, marker: str) -> Any | None:
    """Decode the first JSON value (object or array) that follows `marker`.

    Uses ``json.JSONDecoder.raw_decode`` from the first ``{``/``[`` after the
    marker so trailing prose in the same prompt (the next "## Heading", plain
    text, ...) never breaks the parse.
    """
    idx = text.find(marker)
    if idx == -1:
        return None
    start = idx + len(marker)
    brace_at = None
    for i in range(start, len(text)):
        if text[i] in "{[":
            brace_at = i
            break
    if brace_at is None:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(text[brace_at:])
    except json.JSONDecodeError:
        return None
    return value


def _line_after(text: str, marker: str) -> str:
    """Return the text on the same line immediately following `marker`."""
    idx = text.find(marker)
    if idx == -1:
        return ""
    rest = text[idx + len(marker) :]
    return rest.split("\n", 1)[0].strip()


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


# ---------------------------------------------------------------------------
# Input-reading helpers
#
# The fixtures below are *derived from the caller's input*, not canned. These
# helpers read back what every prompt builder already embeds: the resume and
# job description text, the handoff/helper JSON, confirmed Evidence Profile
# facts and regenerate feedback. Everything is a pure function of the prompt,
# so the same input always produces the same output.
# ---------------------------------------------------------------------------

_KNOWN_HEADINGS = (
    "Locked payload",
    "Prepass evidence",
    "Helper signals",
    "Application handoff context",
    "Detected sector",
    "Candidate Resume",
    "Resume",
    "Job Description",
    "Target Job Description",
    "Stated target role",
    "Target Role",
    "Career Profile",
    "Confirmed evidence profile",
    "Unconfirmed profile items",
    "User feedback on previous result",
    "Interview Question",
    "User Answer",
    "Model Answer",
)
_HEADING_RE = re.compile(r"\n## (?:" + "|".join(re.escape(h) for h in _KNOWN_HEADINGS) + r")\b")
_BLANK_VALUES = {"", "none", "none provided", "none provided.", "n/a", "na", "null", "(none)"}


def _section(text: str, heading: str) -> str:
    """Body of the ``## heading`` block, up to the next known ``## `` heading."""
    match = re.search(r"(?:^|\n)## " + re.escape(heading) + r"[^\n]*\n", text)
    if not match:
        return ""
    rest = text[match.end() :]
    following = _HEADING_RE.search(rest)
    return (rest[: following.start()] if following else rest).strip()


def _is_blank(value: str) -> bool:
    return value.strip().lower() in _BLANK_VALUES


def _resume_text(user_prompt: str) -> str:
    return _section(user_prompt, "Candidate Resume") or _section(user_prompt, "Resume")


def _job_text(user_prompt: str) -> str:
    text = _section(user_prompt, "Job Description") or _section(user_prompt, "Target Job Description")
    return "" if _is_blank(text) else text


def _feedback(user_prompt: str) -> str:
    match = re.search(r"provided this feedback: (.*?)\nIncorporate this feedback", user_prompt, re.DOTALL)
    return match.group(1).strip() if match else ""


def _trim(text: str, limit: int = 140) -> str:
    """Shorten to `limit` characters with an ellipsis, cutting at the last space so a quote does not stop mid-word."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if text[limit - 1] != " " and " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:") + "…"


def _join(items: list[str], limit: int = 3) -> str:
    items = [item for item in items if item][:limit]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _a(phrase: str) -> str:
    """The phrase with its indefinite article: "an entry-level", "a senior"."""
    return f"{'an' if phrase[:1].lower() in 'aeiou' else 'a'} {phrase}"


def _upper_first(text: str) -> str:
    """Upper-case the first letter only; ``str.capitalize`` would lower-case "Python"."""
    return text[:1].upper() + text[1:]


def _agree(items: list[str], limit: int, singular: str, plural: str) -> str:
    """The verb form for ``_join(items, limit)`` as a subject."""
    return singular if len([item for item in items if item][:limit]) <= 1 else plural


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            result.append(item.strip())
    return result


_NOT_NAME_WORDS = frozenset(
    {
        "engineer", "developer", "designer", "manager", "analyst", "scientist", "chef", "director",
        "lead", "specialist", "consultant", "architect", "officer", "intern", "student",
        "professional", "summary", "experience", "skills", "education", "resume", "cv",
        "curriculum", "vitae", "profile", "contact", "objective", "senior", "junior",
    }
)  # fmt: skip
_BULLET_RE = re.compile(r"^\s*[-•*–·]\s+(.*\S)\s*$")
_SECTION_NAMES = frozenset(
    {
        "summary", "professional summary", "profile", "about", "experience", "work experience",
        "professional experience", "work history", "employment", "skills", "technical skills",
        "core competencies", "technologies", "projects", "education", "certifications",
        "awards", "languages", "interests", "contact", "relevant experience", "employment history",
        "internships", "research experience", "volunteer experience", "leadership", "work",
    }
)  # fmt: skip
# A heading that is not in the standard set but plainly opens work ("Teaching Experience",
# "LEADERSHIP & ACTIVITIES"): it ends an Education or Certifications section.
_WORK_HEADING_WORDS = frozenset(
    {"experience", "employment", "work", "internship", "internships", "leadership", "volunteer", "volunteering", "career"}
)


def _section_heading(line: str) -> str | None:
    """The section a heading line opens, or None for an ordinary line."""
    heading = line.lower().rstrip(":").strip()
    if heading in _SECTION_NAMES:
        return heading
    if _BULLET_RE.match(line) or line.endswith(".") or re.search(r"\d", line) or len(heading.split()) > 4:
        return None
    return heading if set(re.findall(r"[a-z]+", heading)) & _WORK_HEADING_WORDS else None
_PAST_TENSE_IRREGULAR = frozenset(
    {
        "led", "built", "ran", "wrote", "drove", "grew", "cut", "won", "made", "launched",
        "shipped", "taught", "spun", "sold", "set", "put", "took", "gave", "brought", "kept",
        "rebuilt", "rewrote", "rolled", "oversaw", "began", "chose", "found", "held", "met", "paid",
        "sent", "spent", "stood", "upheld", "bought", "sought", "caught", "drew", "redrew",
    }
)  # fmt: skip


def _looks_like_name(line: str) -> bool:
    words = line.split()
    if not 2 <= len(words) <= 4 or any(ch.isdigit() or ch in "@:|/" for ch in line):
        return False
    for word in words:
        bare = word.strip(".,'-")
        if not bare or not bare[0].isupper() or bare.lower() in _NOT_NAME_WORDS:
            return False
    return True


# Countries a "City, Country" header segment ends with (a place, never an employer).
_COUNTRIES = (
    "USA|UK|United States|United Kingdom|Germany|France|Spain|Italy|Portugal|Netherlands|Belgium|Austria"
    "|Switzerland|Ireland|Poland|Czechia|Czech Republic|Sweden|Norway|Denmark|Finland|Estonia|Latvia|Lithuania"
    "|Greece|Turkey|Türkiye|Canada|Mexico|Brazil|Argentina|Australia|New Zealand|India|Japan|Singapore"
    "|South Korea|China|Israel|UAE|South Africa|Nigeria|Kenya|Egypt|Ukraine|Romania|Hungary"
)

_CONTACT_RE = re.compile(
    r"@|https?://|www\.|\b[\w-]+\.(?:com|io|dev|net|org|me|co)\b|linkedin|github"
    r"|\+?\(?\d[\d\s().-]{6,}\d"  # phone number
    rf"|^[A-Z][\w.'-]+(?:\s[A-Z][\w.'-]+)*,\s*(?:[A-Z]{{2}}|{_COUNTRIES})(?:\s*\(?(?i:remote)\)?)?$"  # "Austin, TX", "Berlin, Germany"
    r"|^(?i:remote)$",
)


def _looks_like_contact(text: str) -> bool:
    """An email, URL, phone number or "City, Region" segment: header contact details, never an employer."""
    return bool(_CONTACT_RE.search(text.strip()))


_PHONE_SEGMENT = re.compile(r"^\+?[\d\s().-]+$")


def _contact_header_line(line: str) -> bool:
    """A header line carrying an email, link or phone number: contact details, never evidence."""
    if re.search(r"@|https?://|www\.|linkedin|github", line, re.I):
        return True
    segments = [segment.strip() for segment in re.split(r"[|·•]", line)]
    return any(
        _PHONE_SEGMENT.match(segment) and len(re.findall(r"\d", segment)) >= 9 for segment in segments
    )


def _shown_line(keyword: str, resume_text: str) -> str | None:
    """The first resume line that shows ``keyword``, skipping the contact header."""
    body = "\n".join(line for line in _unwrapped_lines(resume_text) if not _contact_header_line(line))
    return evidence_line(keyword, body)


# A degree or a school: "B.S. Computer Science", "BSc", "MBA", "University of Texas". Never a job.
_DEGREE_RE = re.compile(
    # Abbreviations are matched in capitals only: "as" and "ma" are ordinary words.
    r"(?:^|[\s,(])(?:B\.?\s?Sc?|B\.?\s?A|B\.?\s?Eng|M\.?\s?Sc?|M\.?\s?A|M\.?\s?Eng|MBA|Ph\.?\s?D|A\.\s?S)\.?(?=[\s,]|$)"
    r"|(?i:\b(?:bachelor(?:'s)?|master's|masters? (?:of|degree|in)|doctorate|associate degree|diploma|university|college"
    r"|polytechnic)\b)"
)
# "Backend Engineer, Freightline (2022 - present)": a role and its employer, then the dates.
_ROLE_COMMA_RE = re.compile(r"^(?P<role>[A-Z][^,|()]{1,60}?),\s+(?P<employer>[A-Z0-9][^,|()]{0,60}?)\s*\((?P<dates>[^()]*\d{4}[^()]*)\)$")


# Words that make a phrase a job title ("Backend Engineer", "Head of Sales"), not an employer or a place.
_JOB_WORDS = frozenset(
    {
        "engineer", "developer", "designer", "manager", "analyst", "scientist", "chef", "director", "lead",
        "specialist", "consultant", "architect", "officer", "intern", "head", "coordinator", "administrator",
        "assistant", "associate", "founder", "co-founder", "owner", "president", "vp", "cto", "ceo", "cfo", "coo",
        "nurse", "teacher", "accountant", "technician", "writer", "editor", "researcher", "programmer",
        "recruiter", "representative", "executive", "advisor", "adviser", "strategist", "planner", "operator",
        "supervisor", "agent", "clerk", "tutor", "lecturer", "professor", "fellow", "trainee", "apprentice",
        "principal", "partner", "marketer", "copywriter", "producer", "artist", "photographer", "attorney",
        "lawyer", "paralegal", "pharmacist", "therapist", "physician", "doctor", "sre", "devops", "tester",
        "qa", "support", "contractor", "freelancer", "maintainer", "instructor", "counselor", "auditor",
    }
)  # fmt: skip


def _names_a_job(phrase: str) -> bool:
    return any(word.strip(".,()-").lower() in _JOB_WORDS for word in phrase.split())


def _role_line(line: str) -> tuple[str, str] | None:
    """A ``Role at Employer`` line (not a bullet, a sentence, a degree or a contact header)."""
    if _BULLET_RE.match(line) or len(line) > 90 or line.endswith("."):
        return None
    comma = _ROLE_COMMA_RE.match(line)
    if comma and not _DEGREE_RE.search(comma.group("role")):
        role, employer = comma.group("role").strip(), comma.group("employer").strip()
        # "Employer, City (dates)" has the same shape: the left side must name a job, and
        # "Role at Employer, Country" is left to the " at " reading below.
        if (
            _names_a_job(role)
            and not re.search(r" at | @ ", role)
            and not _looks_like_contact(role)
            and not _looks_like_contact(f"{role}, {employer}")
            and 1 <= len(role.split()) <= 6
            and 1 <= len(employer.split()) <= 6
        ):
            return role[:80], employer[:80]
    for sep in (" at ", " @ ", " | "):
        if sep in line:
            role, _, employer = line.partition(sep)
            role = role.strip()
            employer = re.sub(r"\s*[\(,|]?\s*\(?\d{4}.*$", "", employer).strip(" ,;")
            # "Role | Employer | Location": the employer is the first segment only.
            employer = employer.split("|", 1)[0].strip(" ,;")
            if sep != " | ":
                # "Engineer at Siemens, Germany": the place after the employer is not part of it.
                employer = employer.split(",", 1)[0].strip()
            if _looks_like_contact(employer) or _looks_like_contact(role) or _DEGREE_RE.search(role):
                return None
            if 1 <= len(role.split()) <= 6 and 1 <= len(employer.split()) <= 6 and employer[:1].isalnum():
                return role[:80], employer[:80]
    return None


def _past_tense(first_word: str) -> bool:
    word = first_word.lower().strip(",")
    return (word.endswith("ed") and len(word) > 3) or word in _PAST_TENSE_IRREGULAR


@dataclass
class _Bullet:
    text: str
    employer: str = ""

    @property
    def quantified(self) -> bool:
        return bool(re.search(r"\d", self.text))

    def quote(self) -> str:
        """The bullet as an object of a sentence: a first-person sentence is quoted, other bullets read as clauses."""
        text = self.text.rstrip(". ")
        return f'"{text}"' if re.match(r"I\s", text) else self.clause()

    def clause(self) -> str:
        """The bullet as a first-person clause, quoting it when it is not a past-tense action."""
        text = self.text.rstrip(". ")
        if re.match(r"I\s", text):
            # Prose resumes are already first person; quoting them would garble the sentence.
            return text
        if _past_tense(text.split(" ", 1)[0]):
            return "I " + text[0].lower() + text[1:]
        return f'my work included "{text}"'


@dataclass
class _Resume:
    name: str = ""
    lines: list[str] = field(default_factory=list)
    bullets: list[_Bullet] = field(default_factory=list)
    roles: list[tuple[str, str]] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    education: str = ""
    years: int | None = None
    words: int = 0

    @property
    def quantified(self) -> list[_Bullet]:
        return [bullet for bullet in self.bullets if bullet.quantified]

    @property
    def plain(self) -> list[_Bullet]:
        return [bullet for bullet in self.bullets if not bullet.quantified]

    @property
    def current_title(self) -> str:
        return self.roles[0][0] if self.roles else ""

    def bullet_with(self, term: str) -> _Bullet | None:
        needle = term.lower()
        for bullet in self.bullets:
            if needle in bullet.text.lower():
                return bullet
        return None


def _unwrapped_lines(text: str) -> list[str]:
    """The resume's lines with hard-wrapped bullets and sentences joined back up.

    A pasted resume often breaks a bullet mid-sentence ("...reduced" / "request latency
    by 35 percent..."); quoting only its first line cuts the evidence off mid-sentence.
    A line whose first word is in lower case continues the line right above it, except
    under the name and around contact details ("linkedin.com/in/jordan" is its own line).
    """
    lines: list[str] = []
    joinable = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            joinable = False
            continue
        contact = _contact_header_line(line) or _looks_like_contact(line)
        # A first word all in lower case ("request", "while"): "iOS Engineer" starts a new line.
        if (
            joinable
            and not contact
            and re.match(r"[a-z][a-z'-]*(?:[\s,.;:]|$)", line)
            and not _BULLET_RE.match(line)
        ):
            # A wrapped skills list ("Python, Go" / "kubernetes, docker") goes on as a list.
            separator = ", " if _short_list(lines[-1], min_items=2) and _short_list(line) else " "
            lines[-1] = f"{lines[-1]}{separator}{line}"
            continue
        lines.append(line)
        joinable = (
            not contact
            and not (len(lines) == 1 and _looks_like_name(line))
            and line.lower().rstrip(":") not in _SECTION_NAMES
            and not line.endswith(":")
        )
    return lines


def _short_list(line: str, min_items: int = 1) -> bool:
    """A comma list of short items ("Python, Go"), not a sentence or a bullet."""
    if _BULLET_RE.match(line) or line.endswith((".", ",", ";", ":")):
        return False
    items = [item.strip() for item in line.split(",")]
    return len(items) >= min_items and all(0 < len(item.split()) <= 3 for item in items)


def _parse_resume(text: str) -> _Resume:
    lines = _unwrapped_lines(text)
    resume = _Resume(lines=lines, words=len(re.findall(r"\w+", text)))
    if lines and _looks_like_name(lines[0]):
        resume.name = lines[0]
    employer = ""
    section = ""
    in_education: list[bool] = []
    for index, line in enumerate(lines):
        heading = _section_heading(line)
        if heading:
            section = heading
        studying = section in ("education", "certifications")
        in_education.append(studying)
        bullet = _BULLET_RE.match(line)
        if bullet:
            # A degree, a course or a thesis under Education is not work to quote.
            if len(bullet.group(1)) >= 12 and not studying:
                resume.bullets.append(_Bullet(bullet.group(1).strip(), employer))
            continue
        role = None if studying else _role_line(line)
        if role:
            resume.roles.append(role)
            employer = role[1]
        skills_match = re.match(r"^(?:technical |core )?(?:skills|technologies|competencies)\b\s*:?\s*(.*)$", line, re.I)
        if skills_match and not resume.skills:
            raw = skills_match.group(1) or (lines[index + 1] if index + 1 < len(lines) else "")
            resume.skills = _split_skills(raw)
        if re.match(r"^education\b\s*:?\s*(.*)$", line, re.I) and not resume.education:
            inline = re.sub(r"^education\b\s*:?\s*", "", line, flags=re.I)
            resume.education = inline or (lines[index + 1] if index + 1 < len(lines) else "")
    if not resume.skills:
        for line in lines:
            if line.count(",") >= 2 and len(line) < 200 and not _BULLET_RE.match(line) and not line.endswith("."):
                resume.skills = _split_skills(line)
                break
    if not resume.bullets:
        # Prose resumes: treat number-bearing sentences as the quotable facts (never a degree line).
        for line, studying in zip(lines, in_education, strict=True):
            if studying:
                continue
            for sentence in re.split(r"(?<=[.!?])\s+", line):
                # "Computer Science, University of Texas, 2019" (split off a "B.S.") is a degree, not a fact.
                if _DEGREE_RE.search(sentence) and not _past_tense(sentence.split(" ", 1)[0]):
                    continue
                if re.search(r"\d", sentence) and len(sentence.split()) >= 6:
                    resume.bullets.append(_Bullet(sentence.strip()))
    years = re.search(r"(\d{1,2})\+?\s+years", text, re.I)
    resume.years = int(years.group(1)) if years else None
    return resume


def _split_skills(raw: str) -> list[str]:
    # A slash joins one skill ("CI/CD", "UI/UX", "TCP/IP"); only a spaced " / " separates two.
    items = [item.strip(" .;") for item in re.split(r"[,|•;]|\s/\s", raw)]
    return _unique([item for item in items if 0 < len(item) <= 40 and item.lower() not in _SECTION_NAMES])[:12]


def _role_label(job_description: str, handoff: dict | None = None) -> str:
    label = str((handoff or {}).get("role_label") or "").strip()
    if label and label.lower() != "this role":
        return label
    title, _company = _job_header(job_description)
    return title or extract_role_label(job_description) or "this role"


def _at(company: str) -> str:
    return f" at {company}" if company else ""


_GENERIC_ROLE = "this role"


def _the_role(role: str) -> str:
    return "this role" if role == _GENERIC_ROLE else f"the {role} role"


def _the_posting(role: str) -> str:
    return "The posting" if role == _GENERIC_ROLE else f"The {role} posting"


def _as_role(role: str) -> str:
    return "in the job" if role == _GENERIC_ROLE else f"as {role}"


def _the_team(role: str) -> str:
    return "the team" if role == _GENERIC_ROLE else f"the {role} team"


def _confirmed_facts(user_prompt: str) -> list[str]:
    """Plain-text statements of the *confirmed* Evidence Profile facts in the prompt."""
    block = _section(user_prompt, "Confirmed evidence profile")
    facts: list[str] = []
    for line in block.splitlines():
        match = re.match(r"^- \[([\w-]+)\]\s*(\{.*\})\s*$", line.strip())
        if not match:
            continue
        try:
            content = json.loads(match.group(2))
        except json.JSONDecodeError:
            continue
        if isinstance(content, dict):
            text = _fact_text(match.group(1), content)
            if text:
                facts.append(text)
    return facts


def _fact_text(kind: str, content: dict) -> str:
    values = {key: str(value).strip() for key, value in content.items() if str(value).strip()}
    if kind == "experience" and values.get("role"):
        return f"{values['role']} at {values['employer']}" if values.get("employer") else values["role"]
    for key in ("statement", "name", "title", "summary", "target", "story"):
        if values.get(key):
            return values[key]
    return ", ".join(values.values())


def _top_resume_fact(resume: _Resume) -> str:
    quantified = resume.quantified
    return quantified[0].text.rstrip(". ") if quantified else (resume.bullets[0].text.rstrip(". ") if resume.bullets else "")


# ---------------------------------------------------------------------------
# Re-generate feedback
#
# A real model reads "make it more concise" or "focus on leadership" and changes
# its answer; the fake must too, or a Re-generate looks broken in a demo. Two
# intents are recognised: concise (fewer items, one sentence each) and a focus
# topic (items about it first, and a lead action that names it).
# ---------------------------------------------------------------------------

_CONCISE_RE = re.compile(r"\b(?:short|shorter|concise|brief|briefer|trim|tighter|cut down|too long|less wordy)\b", re.I)
_FOCUS_RE = re.compile(
    r"\b(?:focus(?:ed|ing)?|emphasi[sz]e|highlight|lead with|more about|prioriti[sz]e)\s+"
    r"(?:more\s+)?(?:on\s+|about\s+)?(?:my\s+|the\s+|a\s+|an\s+)?"
    r"(?P<topic>[a-z][a-z0-9/&+ -]{1,40}?)(?=\s*(?:[.,;!?]|$|\band\b|\binstead\b|\brather\b))",
    re.I,
)


# "Focus on leadership please": politeness and filler after the topic are not part of it.
_FILLER_TAIL = re.compile(
    r"(?:\s+(?:please|pls|thanks|thank you|thx|too|as well|a bit|a little|a lot|more|instead|now|again))+\s*$", re.I
)


@dataclass(frozen=True)
class _FeedbackIntent:
    concise: bool = False
    topic: str = ""


def _feedback_intent(feedback: str) -> _FeedbackIntent:
    if not feedback:
        return _FeedbackIntent()
    match = _FOCUS_RE.search(feedback)
    topic = _FILLER_TAIL.sub("", match.group("topic")).strip() if match else ""
    return _FeedbackIntent(concise=bool(_CONCISE_RE.search(feedback)), topic=topic)


def _first_sentence(text: str) -> str:
    return re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip(), maxsplit=1)[0]


def _mentions(item: Any, topic: str) -> bool:
    return topic.lower() in json.dumps(item, ensure_ascii=False).lower()


def _reflect_feedback(
    result: dict,
    intent: _FeedbackIntent,
    *,
    keep: dict[str, int],
    shorten: tuple[str, ...] = (),
    sub_keep: dict[str, int] | None = None,
    focus_action: str = "",
) -> dict:
    """Apply the feedback intent to the listed parts of a builder's result, in place."""
    if intent.topic:
        topic = intent.topic
        for key in keep:
            items = result.get(key)
            if isinstance(items, list):
                result[key] = sorted(items, key=lambda item: not _mentions(item, topic))
        actions = result.get("top_actions")
        if focus_action and isinstance(actions, list) and not (actions and _mentions(actions[0], topic)):
            actions.insert(
                0, {"title": f"Put {topic} first", "action": focus_action.format(topic=topic), "priority": "high"}
            )
    if intent.concise:
        for key, count in keep.items():
            items = result.get(key)
            if not isinstance(items, list):
                continue
            items = items[:count]
            for item in items:
                if not isinstance(item, dict):
                    continue
                for name in shorten:
                    if isinstance(item.get(name), str):
                        item[name] = _first_sentence(item[name])
                for name, count_inner in (sub_keep or {}).items():
                    if isinstance(item.get(name), list):
                        item[name] = item[name][:count_inner]
            result[key] = [_first_sentence(item) if isinstance(item, str) else item for item in items]
    return result


# ---------------------------------------------------------------------------
# Resume Analyzer — marker from app/prompts/resume.py build_resume_prompt
# ---------------------------------------------------------------------------

_MARKER_RESUME = "You are an expert resume analyst and career advisor."

_CATEGORY_ORDER = ["keywords", "impact", "structure", "clarity", "completeness"]
_CATEGORY_LABEL = {
    "keywords": "keyword match",
    "impact": "measurable impact",
    "structure": "structure",
    "clarity": "clarity",
    "completeness": "completeness",
}
_EXPECTED_SECTIONS = ["Summary", "Experience", "Skills", "Education"]


def _severity(score: int) -> str:
    return "high" if score < 55 else "medium" if score < 72 else "low"


def _resume_headline(verdict: str, *, weakest: str, strength: str, focus: str, role: str, has_job: bool) -> str:
    # Keyed on the locked verdict (the heuristic-score band), so the headline can
    # never contradict the score the page shows next to it.
    if verdict == "Strong foundation":
        tail = f"{focus} is the one gap worth closing" if focus else "only light polish is left"
        return f"Strong foundation: {strength}; {tail}."
    if verdict == "Promising but uneven":
        return f"Promising but uneven: {strength}, while {weakest} holds the resume back."
    if not has_job:
        return f"Not competitive yet: {weakest} needs clearer evidence before this resume reads as strong."
    return f"Not competitive yet: {weakest} needs clearer evidence before this reads as a fit for {role}."


def _resume_analyzer(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    prepass = _json_after(user_prompt, "## Prepass evidence") or {}
    resume = _parse_resume(_resume_text(user_prompt))
    job_description = _job_text(user_prompt)
    role = _role_label(job_description)
    missing = _string_list(prepass.get("missing_keywords"))
    matched = _string_list(prepass.get("matched_keywords"))
    skills = _string_list(prepass.get("detected_skills")) or resume.skills
    detected_sections = _string_list(prepass.get("detected_sections"))

    # Agree with the heuristics: the fake "model" scores each category exactly as
    # the locked baseline does, so the blended score (and therefore the verdict
    # and headline written below) is the locked one.
    locked_breakdown = {
        str(item.get("key")): int(item.get("score", 70))
        for item in (locked.get("score_breakdown") or [])
        if isinstance(item, dict)
    }
    scores = {key: locked_breakdown.get(key, 70) for key in _CATEGORY_ORDER}
    locked_summary = locked.get("summary") if isinstance(locked.get("summary"), dict) else {}
    verdict = str(locked_summary.get("verdict") or "Promising but uneven")

    quantified = resume.quantified
    plain = resume.plain
    focus = missing[0] if missing else ""
    weakest_key = min(_CATEGORY_ORDER, key=lambda key: (scores[key], _CATEGORY_ORDER.index(key)))
    strength = (
        f"you already show {_join(matched, 3)}"
        if matched
        else f"{len(quantified)} bullets carry real numbers"
        if quantified
        else f"the {_join(skills, 3)} skills are visible"
        if skills
        else "the core sections are in place"
    )

    candidates: dict[str, dict] = {}
    if missing:
        candidates["keywords"] = {
            "id": "keywords-close-the-gap",
            "title": f"Direct evidence for {focus} is thin",
            "why_it_matters": "Recruiters and ATS filters scan for the posting's own terms before reading the rest.",
            "evidence": (
                f"The posting asks for {_join(missing, 3)}; none of it appears in the resume"
                + (f", although {_join(matched, 2)} {_agree(matched, 2, 'does', 'do')}." if matched else ".")
            ),
            "fix": f"Add one bullet that names {focus} with a concrete outcome, only where it is true.",
        }
    elif job_description:
        candidates["keywords"] = {
            "id": "keywords-make-matches-visible",
            "title": "Keyword coverage is good; make it visible early",
            "why_it_matters": "Matches buried in the third role are easy to miss on a fast skim.",
            "evidence": f"The resume already covers {_join(matched, 4) or 'the posting terms'} for {role}.",
            "fix": "Echo the two strongest matches in the summary and the first experience bullets.",
        }
    else:
        candidates["keywords"] = {
            "id": "keywords-no-target",
            "title": "No target posting to match against",
            "why_it_matters": "Keyword fit is only meaningful against a specific job description.",
            "evidence": f"The resume lists {_join(skills, 3) or 'few skills'}, but there is no posting to compare it with.",
            "fix": "Paste the job description you are applying to and re-run the analysis.",
        }

    if plain and len(quantified) < 3:
        sample = plain[0].text.rstrip(". ")
        candidates["impact"] = {
            "id": "impact-quantify-outcomes",
            "title": "Too few bullets lead with a result",
            "why_it_matters": "Numbers make impact easy to trust at a glance.",
            "evidence": f'Only {len(quantified)} of {len(resume.bullets)} bullets carry a number; "{_trim(sample, 110)}" states the work, not the result.',
            "fix": f'Rewrite "{_trim(sample, 80)}" to lead with the outcome: scope, speed, revenue or reliability.',
        }
    else:
        best = _top_resume_fact(resume)
        candidates["impact"] = {
            "id": "impact-lead-with-the-best-number",
            "title": "Lead with your strongest number",
            "why_it_matters": "The first bullet of each role gets the most attention.",
            "evidence": f'"{_trim(best, 110)}" is the strongest result, but it is not the first thing a reader sees.' if best else "The resume has few concrete results to lead with.",
            "fix": "Move the most convincing quantified bullet to the top of the most recent role.",
        }

    absent = [section for section in _EXPECTED_SECTIONS if section not in detected_sections]
    if absent:
        candidates["structure"] = {
            "id": "structure-add-missing-section",
            "title": f"No {absent[0]} section detected",
            "why_it_matters": "Recruiters and parsers look for the standard sections first.",
            "evidence": f"Detected sections: {', '.join(detected_sections) or 'none'}; {absent[0]} is missing.",
            "fix": f"Add a clearly labeled {absent[0]} section.",
        }
    else:
        candidates["structure"] = {
            "id": "structure-keep-bullets-short",
            "title": "Structure is clean; keep one achievement per bullet",
            "why_it_matters": "Short, single-purpose bullets are what a skim actually reads.",
            "evidence": f"All of {', '.join(detected_sections[:4])} are present, with {len(resume.bullets)} bullets in total.",
            "fix": "Split any bullet that carries two achievements into two lines.",
        }

    if resume.words and resume.words < 180:
        candidates["clarity"] = {
            "id": "clarity-add-context",
            "title": "Thin on context for each role",
            "why_it_matters": "Without scope and ownership, strong results are hard to size.",
            "evidence": f"The resume is about {resume.words} words long.",
            "fix": "Add a line per role on team size, scope and what you owned.",
        }
    else:
        summary_line = next((line for line in resume.lines if len(line.split()) >= 8 and not _BULLET_RE.match(line)), "")
        candidates["clarity"] = {
            "id": "clarity-sharpen-the-summary",
            "title": "Sharpen the opening summary",
            "why_it_matters": "The summary is read first and sets how the rest is judged.",
            "evidence": f'The opening line, "{_trim(summary_line, 100)}", could name the target role and one headline result.' if summary_line else "There is no opening summary that frames the target role.",
            "fix": f"Rewrite the summary in two lines: who you are for {role} and your strongest result.",
        }

    optional = [s for s in ("Projects", "Certifications") if s not in detected_sections]
    candidates["completeness"] = {
        "id": "completeness-fill-the-gaps",
        "title": f"No {optional[0].lower()} section to back up the claims" if optional else "Completeness looks solid",
        "why_it_matters": "Supporting sections give a reader a second place to find proof.",
        "evidence": f"Present: {', '.join(detected_sections) or 'little'}; {optional[0]} is absent." if optional else f"Present: {', '.join(detected_sections)}.",
        "fix": f"Add a short {optional[0]} section with one or two relevant items." if optional else "Keep every section current.",
    }

    ordered = sorted(_CATEGORY_ORDER, key=lambda key: (scores[key], _CATEGORY_ORDER.index(key)))
    issues = [
        {"severity": _severity(scores[key]), "category": key, **candidates[key]} for key in ordered[:4]
    ]

    strengths: list[str] = []
    if quantified:
        strengths.append(f'Quantified impact: "{_trim(quantified[0].text, 110)}"')
    if matched:
        strengths.append(f"Shows direct experience with {_join(matched, 4)}, as the posting asks.")
    if skills:
        strengths.append(f"Surfaces relevant tooling, including {_join(skills, 4)}.")
    if resume.years:
        strengths.append(f"States {resume.years} years of experience up front.")
    if len(detected_sections) >= 4:
        strengths.append(f"Covers the sections a recruiter scans first: {', '.join(detected_sections[:4])}.")
    if not strengths:
        strengths.append("Provides enough raw material to improve with more specific evidence.")

    top_actions = [
        {"title": issue["title"], "action": issue["fix"], "priority": issue["severity"]} for issue in issues[:3]
    ]
    result: dict[str, Any] = {
        "schema_version": "quality_v2",
        "summary": {
            "headline": _resume_headline(verdict, weakest=_CATEGORY_LABEL[weakest_key], strength=strength, focus=focus, role=role, has_job=bool(job_description)),
            "verdict": verdict,
            "confidence_note": (
                "Directional read from the resume text and job description you provided."
                if job_description
                else "Directional read from the resume text alone; add a job description for a role-specific read."
            ),
        },
        "top_actions": top_actions,
        "llm_score_breakdown": [{"key": key, "score": scores[key]} for key in _CATEGORY_ORDER],
        "strengths": strengths[:5],
        "issues": issues,
    }
    feedback = _feedback(user_prompt)
    if feedback:
        result["summary"]["confidence_note"] = f'Re-read with your note in mind: "{_trim(feedback, 100)}".'
        intent = _feedback_intent(feedback)
        shown = _shown_line(intent.topic, _resume_text(user_prompt)) if intent.topic else None
        if shown and not any(_mentions(item, intent.topic) for item in result["strengths"]):
            result["strengths"].insert(0, f'Shows {intent.topic}: "{_trim(shown, 110)}"')
        _reflect_feedback(
            result,
            intent,
            keep={"issues": 3, "strengths": 2, "top_actions": 2},
            shorten=("why_it_matters", "evidence", "fix", "action"),
            focus_action="Lead your summary and most recent role with one bullet that proves {topic}, only where it is true.",
        )
    if job_description:
        result["role_fit"] = {
            # target_role_label is deliberately omitted: the service fills it from the posting.
            "fit_score": min(95, round((scores["keywords"] + sum(scores.values()) / len(scores)) / 2)),
            "rationale": (
                (f"{_join(matched, 3)} already {_agree(matched, 3, 'reads', 'read')} as credible" if matched else "A few relevant areas already read as credible")
                + (f", but {_join(missing, 2)} {_agree(missing, 2, 'needs', 'need')} clearer proof before this reads as a strong match." if missing else ".")
            ),
        }
    return result


# ---------------------------------------------------------------------------
# Job Match — marker from app/prompts/job_match.py build_job_match_prompt
# ---------------------------------------------------------------------------

_MARKER_JOB_MATCH = "You are an expert job matching analyst."

_SOFT_KEYWORDS = frozenset({"leadership", "communication", "mentoring", "collaboration", "stakeholder management", "ownership"})


def _job_match_headline(verdict: str, *, matched: list[str], missing: list[str], role: str) -> str:
    # Keyed on the locked verdict (score band), never on whether *any* keyword matched.
    total = len(matched) + len(missing)
    if verdict == "strong":
        return f"You already cover {_join(matched, 3)}; a few edits make the fit for {role} easier to trust."
    if verdict == "borderline" and not missing:
        # Only reachable when the posting names too little to judge (the score is capped).
        if not matched:
            return f"The posting names no requirement we can check for {role}; paste the full posting for a firmer read."
        return (
            f"You match the {len(matched)} {_agree(matched, 3, 'requirement', 'requirements')} this posting names for {role} "
            f"({_join(matched, 3)}); paste the full posting for a firmer read."
        )
    if verdict == "borderline":
        return (
            f"You match {len(matched)} of {total} {'requirement' if total == 1 else 'requirements'} for {role}, but "
            + (f"{_join(missing, 2)} still {_agree(missing, 2, 'needs', 'need')} proof." if missing else "the remaining requirements still need proof.")
        )
    tail = f"; only {_join(matched, 3)} {_agree(matched, 3, 'lines', 'line')} up" if matched else ""
    subject = (
        f"{_join(missing, 3)} {_agree(missing, 3, 'is', 'are')}" if missing else "the core requirements are"
    )
    return f"This reads as a stretch for {role}: {subject} not evidenced in the resume{tail}."


def _job_matcher(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    prepass = _json_after(user_prompt, "## Prepass evidence") or {}
    resume = _parse_resume(_resume_text(user_prompt))
    job_description = _job_text(user_prompt)
    matched = _string_list(prepass.get("matched_keywords"))
    missing = _string_list(prepass.get("missing_keywords"))
    role = _role_label(job_description)
    title, company = _job_header(job_description)

    verdict = str(locked.get("verdict") or "")
    if verdict not in {"strong", "borderline", "stretch"}:
        verdict = "strong" if len(matched) >= 2 * len(missing) and matched else "borderline" if matched else "stretch"

    requirements = []
    resume_text = _resume_text(user_prompt)
    for index, keyword in enumerate(matched[:3]):
        bullet = resume.bullet_with(keyword)
        # Quote the line that shows it: a synonym match ("Led a team" for Leadership) is not "listed".
        line = bullet.text if bullet else _shown_line(keyword, resume_text)
        evidence = f'Resume: "{_trim(line, 90)}"' if line else f"The resume shows {keyword} indirectly."
        requirements.append(
            {
                "requirement": keyword,
                "importance": "must" if index < 2 else "preferred",
                "status": "matched",
                "resume_evidence": evidence,
                "suggested_fix": f"Keep {keyword} visible in the summary and your strongest bullet.",
            }
        )
    for index, keyword in enumerate(missing[:3]):
        adjacent = resume.skills[index % len(resume.skills)] if resume.skills else ""
        requirements.append(
            {
                "requirement": keyword,
                "importance": "must" if index < 2 else "preferred",
                "status": "missing",
                "resume_evidence": f"No bullet mentions {keyword}" + (f"; the closest is your {adjacent} work." if adjacent else "."),
                "suggested_fix": f"Add a bullet that proves {keyword} with scope and a measurable result.",
            }
        )
    if not requirements:
        requirements.append(
            {
                "requirement": "Role alignment",
                "importance": "preferred",
                "status": "partial",
                "resume_evidence": f"The resume shows adjacent experience for {role} without an exact keyword match.",
                "suggested_fix": "Mirror the posting's own language where it is honestly true.",
            }
        )

    missing_keywords = [
        {
            "keyword": keyword,
            "contextual_guidance": f"Work {keyword} into the {resume.bullets[index % len(resume.bullets)].employer or 'most recent'} bullets where it is true."
            if resume.bullets
            else f"Work {keyword} into an existing bullet where it is true.",
            "anti_stuffing_note": "Only add it if you can back it up in an interview.",
        }
        for index, keyword in enumerate(missing[:4])
    ]

    tailoring_actions = []
    for index, keyword in enumerate(missing[:3]):
        soft = keyword.lower() in _SOFT_KEYWORDS
        target = resume.plain[index % len(resume.plain)] if resume.plain else None
        tailoring_actions.append(
            {
                "section": "summary" if soft else "skills" if index == 2 else "experience",
                "keyword": keyword,
                "action": (
                    f'Rework "{_trim(target.text, 70)}" to show {keyword} with its outcome.'
                    if target
                    else f"Add a specific example that proves {keyword} with scope and outcome."
                ),
            }
        )

    summary_note = "Directional heuristic based on keyword and evidence overlap."
    feedback = _feedback(user_prompt)
    if feedback:
        summary_note = f'Re-read with your note in mind: "{_trim(feedback, 100)}".'

    result = {
        "schema_version": "quality_v2",
        "summary": {
            "headline": "",  # written last, from the requirement rows the page counts
            "verdict": verdict,
            "confidence_note": summary_note,
        },
        "job_title": title or None,
        "company": company or None,
        "top_actions": [
            {
                "title": f"Close the {missing[0]} gap" if missing else "Keep the strongest matches visible",
                "action": tailoring_actions[0]["action"] if tailoring_actions else f"Keep {_join(matched, 2) or 'your top matches'} in the summary and skills section.",
                "priority": "high" if missing else "medium",
            }
        ],
        "verdict": verdict,
        "requirements": requirements[:6],
        "missing_keywords": missing_keywords,
        "tailoring_actions": tailoring_actions[:4],
        "interview_focus": (missing[:3] or matched[:3]) or [f"Scope and ownership for {role}"],
        "recruiter_summary": (
            f"For {role}{_at(company)}, this resume shows evidence for {_join(matched, 3) or 'some relevant experience'}"
            + (f", but still needs clearer proof for {_join(missing, 3)} to read as a strong match." if missing else ".")
        ),
    }
    intent = _feedback_intent(feedback)
    _reflect_feedback(
        result,
        intent,
        # Concise shortens the text, never the gaps: every missing keyword stays.
        keep={"requirements": 6, "tailoring_actions": 1, "missing_keywords": 4, "top_actions": 1, "interview_focus": 2},
        shorten=("resume_evidence", "suggested_fix", "contextual_guidance", "anti_stuffing_note", "action"),
        focus_action=f"Make {{topic}} the first thing a recruiter for {role} reads: name it in your summary and top bullet, only where it is true.",
    )
    if intent.concise:
        # At most two requirements per status, so a shorter list never hides every gap.
        per_status: dict[str, int] = {}
        kept = []
        for requirement in result["requirements"]:
            seen = per_status.get(requirement["status"], 0)
            if seen < 2:
                kept.append(requirement)
                per_status[requirement["status"]] = seen + 1
        result["requirements"] = kept
    # "You match 3 of 6 requirements" counts the rows the page shows ("Requirements met
    # 3 of 6"), never the keyword lists, which are longer.
    rows = result["requirements"]
    result["summary"]["headline"] = _job_match_headline(
        verdict,
        matched=[row["requirement"] for row in rows if row["status"] == "matched"],
        missing=[row["requirement"] for row in rows if row["status"] == "missing"],
        role=role,
    )
    return result


# ---------------------------------------------------------------------------
# Cover Letter — marker from app/prompts/cover_letter.py build_cover_letter_prompt
# ---------------------------------------------------------------------------

_MARKER_COVER_LETTER = "You are an expert cover letter writer and application strategist."


def _section_dict(text: str, why: str, requirements: list[str], evidence: list[str]) -> dict:
    return {
        "text": text,
        "why_this_paragraph": why,
        "requirements_used": requirements[:3],
        "evidence_used": [item for item in evidence if item][:3],
    }


def _cover_letter(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    handoff = _json_after(user_prompt, "## Application handoff context") or {}
    tone = str(locked.get("tone_used") or "Professional")
    resume = _parse_resume(_resume_text(user_prompt))
    job_description = _job_text(user_prompt)
    role = _role_label(job_description, handoff)
    _title, company = _job_header(job_description)
    matched = _string_list(handoff.get("matched_keywords"))
    missing = _string_list(handoff.get("priority_requirements")) or _string_list(handoff.get("missing_keywords"))
    missing = [item for item in missing if item not in matched]
    facts = _confirmed_facts(user_prompt)
    feedback = _feedback(user_prompt)
    wants_short = bool(re.search(r"short|concise|brief|trim|tighter|cut down", feedback, re.I))
    wants_numbers = bool(re.search(r"metric|number|quantif|data|result", feedback, re.I))

    quantified = resume.quantified
    proof = quantified[0] if quantified else (resume.bullets[0] if resume.bullets else None)
    proof2 = quantified[1] if len(quantified) > 1 else None
    opening_proof = proof
    if tone == "Confident" and proof and proof2:
        # The opening leads with the best result, so the body moves on to the next one.
        proof, proof2 = proof2, (quantified[2] if len(quantified) > 2 else None)
    experience = f"{resume.years} years of experience" if resume.years else "my experience"
    title = f" as {_a(resume.current_title)}" if resume.current_title else ""
    where = _at(company)
    greeting = f"Dear {company} hiring team," if company else "Dear Hiring Manager,"
    skills_phrase = _join(matched, 3) or _join(resume.skills, 3)
    background = f"my background in {skills_phrase}" if skills_phrase else "my background"
    has_standing = bool(resume.years or resume.current_title)

    if tone == "Confident":
        lead = f"{opening_proof.clause()[0].upper()}{opening_proof.clause()[1:]}" if opening_proof else "I deliver results"
        opening_body = (
            f"{lead.rstrip('.')}. That is the kind of result I would bring to {_the_role(role)}{where}, "
            f"and it is why I am applying."
        )
    elif tone == "Warm":
        opening_body = (
            f"I was genuinely excited to see {'this opening' if role == _GENERIC_ROLE else f'the {role} opening'}{where}. "
            f"{_upper_first(experience) if resume.years else 'My experience'}{title} has taught me to care about "
            f"{skills_phrase or 'the craft'} and the people I build it with, and that is what drew me to your team."
        )
    else:
        opening_body = (
            f"I am writing to apply for {'this position' if role == _GENERIC_ROLE else f'the {role} position'}{where}. "
            + (f"With {experience}{title}, {background}" if has_standing else _upper_first(background))
            + " maps directly to what the role asks for."
        )
    named = (
        "the role and company" if company and role != _GENERIC_ROLE
        else "the company" if company
        else "the role" if role != _GENERIC_ROLE
        else ""
    )
    opening = _section_dict(
        f"{greeting}\n\n{opening_body}",
        f"Names {named}, then states the closest match up front." if named else "States the closest match up front.",
        matched,
        [skills_phrase],
    )

    body_points: list[dict] = []
    if proof:
        clause = proof.clause()
        if proof.employer:
            sentence = f"At {proof.employer}, {clause}."
        else:
            # "My work included ..." already says where; "In my recent work, my work included" says it twice.
            sentence = f"In my recent work, {clause}." if clause.startswith("I ") else f"{_upper_first(clause)}."
        if proof2 and (wants_numbers or not wants_short):
            sentence += f" I also {proof2.clause()[2:]}." if proof2.clause().startswith("I ") else f" Elsewhere, {proof2.clause()}."
        if matched:
            sentence += f" That is the same {_join(matched[:2], 2)} work your posting puts first."
        body_points.append(
            _section_dict(sentence, "Leads with the strongest quantified result from the resume.", matched, [proof.text, proof2.text if proof2 else ""])
        )
    else:
        body_points.append(
            _section_dict(
                f"My resume shows hands-on work with {skills_phrase or 'the core requirements'}, and I would be glad to walk through the details.",
                "Anchors the pitch in the skills the resume does show.",
                matched,
                [skills_phrase],
            )
        )

    if facts:
        extra = _join([_trim(fact, 140) for fact in facts], 2)
        body_points.append(
            _section_dict(
                f"Beyond what is on my resume, I can also point to {extra}.",
                "Adds proof the applicant has confirmed on their Evidence Profile.",
                missing or matched,
                facts[:2],
            )
        )
    if missing and not wants_short:
        adjacent = resume.skills[0] if resume.skills else (matched[0] if matched else "adjacent work")
        body_points.append(
            _section_dict(
                f"I would rather be upfront that {_join(missing, 2)} {'are' if len(missing) > 1 else 'is'} not yet a headline item on my resume. "
                f"The closest adjacent work is my {adjacent} experience, and I would ramp up on {missing[0]} quickly.",
                "Addresses the biggest gap before it becomes an objection, without overstating fit.",
                missing,
                [adjacent],
            )
        )
    elif not missing and not wants_short and resume.plain:
        body_points.append(
            _section_dict(
                f"Beyond the headline numbers, {resume.plain[0].clause()}, which reflects how I work with the people around me.",
                "Rounds out the pitch with a durable, less flashy strength.",
                matched,
                [resume.plain[0].text],
            )
        )
    body_points = body_points[:3]

    closing_text = {
        "Confident": f"I would like to talk through how I can deliver the same for {_the_team(role)}{where}.",
        "Warm": f"I would love the chance to talk with the {company + ' ' if company else ''}team about how I can contribute. Thank you for reading.",
    }.get(
        tone,
        f"Thank you for your time and consideration. I would welcome the chance to discuss how my experience fits {_the_role(role)}{where}.",
    )
    closing = _section_dict(closing_text, "Ends with a concrete, low-friction next step.", missing or matched, [])

    sign_off = f"Sincerely,\n{resume.name}" if resume.name else ""
    full_text = "\n\n".join([opening["text"], *[bp["text"] for bp in body_points], closing["text"], sign_off]).strip()

    notes = [
        {
            "category": "tone",
            "note": f"Written in a {tone.lower()} register to match the requested tone.",
            "requirements_used": [],
            "source": "job-description",
        }
    ]
    if facts:
        notes.append(
            {
                "category": "evidence",
                "note": f'Cites your confirmed profile evidence: "{_trim(facts[0], 100)}".',
                "requirements_used": matched[:2],
                "source": "resume",
            }
        )
    if missing:
        notes.append(
            {
                "category": "gap",
                "note": f"Names {_join(missing, 2)} as a gap rather than claiming it.",
                "requirements_used": missing[:2],
                "source": "job-match",
            }
        )
    if feedback:
        if wants_short:
            note = f'Made the letter shorter based on your feedback: "{_trim(feedback, 100)}".'
        elif wants_numbers:
            note = f'Put the quantified results first, as your feedback asked: "{_trim(feedback, 100)}".'
        else:
            note = f'Revised with your feedback in mind: "{_trim(feedback, 100)}".'
        notes.insert(0, {"category": "tone", "note": note, "requirements_used": [], "source": "resume"})

    lead_fact = _trim(_top_resume_fact(resume), 110)
    return {
        "schema_version": "quality_v2",
        "summary": {
            "headline": (
                f"A {tone.lower()} letter for {'this role' if role == _GENERIC_ROLE else role}{where}"
                + (f' that leads with "{lead_fact}".' if lead_fact else ".")
            ),
            "verdict": "Application-ready draft",
            "confidence_note": "Generated from the resume and job description you provided; review before sending.",
        },
        "top_actions": [
            {
                "title": f"Prove {missing[0]} in one sentence" if missing else "Add one more concrete number",
                "action": (
                    f"If you have real {missing[0]} experience, add one sentence naming it."
                    if missing
                    else "Swap a general claim for a specific metric wherever you have one."
                ),
                "priority": "high" if missing else "medium",
            }
        ],
        "opening": opening,
        "body_points": body_points,
        "closing": closing,
        "full_text": full_text,
        "sign_off": sign_off,
        "tone_used": tone,
        "customization_notes": notes[:4],
    }


# ---------------------------------------------------------------------------
# Interview Q&A — two markers from app/prompts/interview.py
# ---------------------------------------------------------------------------

_MARKER_INTERVIEW_QUESTIONS = "You are an expert interview coach and hiring manager."
_MARKER_INTERVIEW_PRACTICE = "You are an interview coach evaluating a practice answer."

_QUESTION_COUNT_RE = re.compile(r"Generate exactly (\d+) questions")

# (template, answer tail, structure, why asked). Each focus area gets a different
# angle per round, so a deck never repeats one question with the topic swapped.
_QUESTION_KINDS: list[tuple[str, str, list[str], str]] = [
    (
        "Tell me about a time you used {f} to deliver a measurable result.",
        "I would set up the situation in one sentence, then spend most of the answer on what I personally did and the number that changed.",
        ["Situation", "Action", "Result"],
        "Tests whether your {f} story is concrete.",
    ),
    (
        "Imagine a high-stakes deadline in your first month {r}{co} and {f} is the blocker. What do you do first?",
        "I would size the risk, name the owner, and agree the smallest change that unblocks the deadline before I touch anything else.",
        ["Diagnose", "Decide", "Communicate"],
        "Shows how you prioritise under pressure.",
    ),
    (
        "What is the hardest trade-off you have made involving {f}, and how did you decide?",
        "I would name the two options, the constraint that forced the choice, and what I would still do differently.",
        ["Options", "Constraint", "Decision"],
        "Probes judgment, not just execution.",
    ),
    (
        "How would you explain {f} to a teammate who has never worked with it?",
        "I would start from the problem it solves, give one concrete example from my own work, and check understanding with a question.",
        ["Problem", "Example", "Check"],
        "Checks depth of understanding and communication.",
    ),
    (
        "Describe a time {f} did not go as planned. What changed afterwards?",
        "I would own the miss plainly, explain what the signals were, and show the process change that followed.",
        ["What happened", "Why", "What changed"],
        "Looks for honesty and learning.",
    ),
    (
        "How would you measure whether your {f} work is succeeding in {tr}?",
        "I would pick one leading and one lagging metric, say how often I would review them, and what would make me change course.",
        ["Metric", "Baseline", "Review"],
        "Tests whether you tie {f} to outcomes.",
    ),
    (
        "Where will {f} matter most{co_or_team}, and how would you ramp up on it?",
        "I would map where {f} touches the roadmap, talk to the people who own it today, and plan a first small win.",
        ["Where", "Who", "First win"],
        "Checks that you understand the job's real surface area.",
    ),
    (
        "What would you do in your first 30 days to raise the bar on {f}?",
        "I would audit the current state, fix one visible problem, and write down the standard I want the team to hold.",
        ["Audit", "Quick win", "Standard"],
        "Tests initiative and sequencing.",
    ),
]


_GENERIC_FOCUS = ["Problem solving", "Ownership", "Collaboration", "Handling pressure"]


def _focus_pool(handoff: dict, resume: _Resume) -> list[str]:
    pool = _unique(_string_list(handoff.get("interview_focus")) + _string_list(handoff.get("priority_requirements")))
    # Without a posting, fall back to what the resume itself shows, then to universal topics.
    return pool[:4] or resume.skills[:4] or _GENERIC_FOCUS


def _interview_questions(system_prompt: str, user_prompt: str) -> dict:
    match = _QUESTION_COUNT_RE.search(system_prompt)
    count = max(3, min(int(match.group(1)), 12)) if match else 5

    handoff = _json_after(user_prompt, "## Application handoff context") or {}
    resume = _parse_resume(_resume_text(user_prompt))
    job_description = _job_text(user_prompt)
    role = _role_label(job_description, handoff)
    _title, company = _job_header(job_description)
    co = _at(company)
    co_or_team = co or " on this team"
    pool = _focus_pool(handoff, resume)
    weak = [item for item in _unique(_string_list(handoff.get("missing_keywords"))) if item in pool]
    facts = _confirmed_facts(user_prompt)
    feedback = _feedback(user_prompt)
    adjacent = resume.skills[0] if resume.skills else (_string_list(handoff.get("matched_keywords")) or ["my recent work"])[0]

    def grounding(focus: str) -> tuple[str, str]:
        bullet = resume.bullet_with(focus)
        if bullet:
            place = f" at {bullet.employer}" if bullet.employer else ""
            return f"I would use my work{place}: {bullet.quote()}.", bullet.text
        if focus in weak:
            return (
                f"I would be upfront that {focus} is not a core part of my recent work, then describe the closest "
                f"example, my {adjacent} experience, and how I would ramp up.",
                "",
            )
        top = resume.quantified[0] if resume.quantified else None
        if top:
            return f"I would draw on {top.quote()} and connect it back to {focus}.", top.text
        return f"I would anchor this in the closest project from my background to {focus}.", ""

    def kind_question(focus: str, round_index: int, offset: int) -> dict:
        is_weak = focus in weak
        if is_weak and round_index == 0:
            question = (
                f"{_the_posting(role)} asks for {focus}, but your resume does not show it directly. "
                f"How have you handled something similar, and how would you close the gap?"
            )
            tail = f"Then I would commit to a concrete first step on {focus} for the first month."
            structure = ["Be upfront", "Closest example", "Ramp-up plan"]
            why = f"Checks how you handle a gap in {focus}."
        else:
            template, tail_t, structure, why_t = _QUESTION_KINDS[(round_index + offset) % len(_QUESTION_KINDS)]
            question = template.format(f=focus, r=_as_role(role), tr=_the_role(role), co=co, co_or_team=co_or_team)
            tail = tail_t.format(f=focus)
            why = why_t.format(f=focus)
        lead, metric = grounding(focus)
        return {
            "question": question,
            "answer": f"{lead} {tail}",
            "key_points": [focus, _trim(metric, 60) or "Specific example", "Measurable outcome"],
            "answer_structure": structure,
            "follow_up_questions": [
                f"What would you do differently on {focus} now?",
                f"How did you know the {focus} work had succeeded?",
            ],
            "focus_area": focus,
            "why_asked": why,
            "practice_first": is_weak,
        }

    intent = _feedback_intent(feedback)
    if intent.topic and not any(intent.topic.lower() in item.lower() for item in pool):
        # Asked to focus on a topic the posting does not name: practise it first anyway.
        pool = [intent.topic[:1].upper() + intent.topic[1:], *pool][:4]
    first_round = [kind_question(focus, 0, index) for index, focus in enumerate(pool)]

    specials: list[dict] = []
    for bullet in (resume.quantified or resume.bullets)[:3]:
        place = f"At {bullet.employer}, your" if bullet.employer else "Your"
        said = _trim(bullet.text, 150)
        said = said if said.endswith((".", "!", "?", "…")) else f"{said}."
        focus = next((item for item in pool + resume.skills if item.lower() in bullet.text.lower()), "Past impact")
        specials.append(
            {
                "question": f'{place} resume says: "{said}" What was the hardest decision behind that result?',
                "answer": (
                    f"I would walk through the situation, the options we weighed and why I chose the path behind this: "
                    f'"{_trim(bullet.text.rstrip(". "), 120)}".'
                    if re.match(r"I\s", bullet.text)
                    else f"I would walk through the situation, the options we weighed and why I chose the path that {bullet.text[0].lower() + bullet.text[1:].rstrip('. ')}."
                ),
                "key_points": [_trim(bullet.text, 60), "The decision", "What I would repeat"],
                "answer_structure": ["Situation", "Options", "Decision", "Result"],
                "follow_up_questions": ["Who disagreed, and how did you resolve it?", "What would you change on a second pass?"],
                "focus_area": focus,
                "why_asked": "Verifies the headline result on your resume.",
                "practice_first": False,
            }
        )
    for fact in facts[:2]:
        specials.append(
            {
                "question": f'You confirmed this on your profile: "{_trim(fact, 140)}" How would you tell that story in two minutes?',
                "answer": f'I would open with the outcome, "{_trim(fact, 100)}", then explain the situation and my role in it.',
                "key_points": [_trim(fact, 60), "Outcome first", "My role"],
                "answer_structure": ["Outcome", "Situation", "My role"],
                "follow_up_questions": ["What was the hardest part?", "Who else was involved?"],
                "focus_area": "Confirmed achievement",
                "why_asked": "Tests that you can tell your best story crisply.",
                "practice_first": False,
            }
        )

    ordered: list[dict] = []
    queue = iter(specials)
    for index, item in enumerate(first_round):
        ordered.append(item)
        if index % 2 == 0:
            special = next(queue, None)
            if special:
                ordered.append(special)
    ordered.extend(queue)
    round_index = 1
    while len(ordered) < count and round_index <= len(_QUESTION_KINDS):
        for index, focus in enumerate(pool):
            ordered.append(kind_question(focus, round_index, index))
        round_index += 1

    seen: set[str] = set()
    questions: list[dict] = []
    for item in ordered:
        if item["question"] not in seen:
            seen.add(item["question"])
            questions.append(item)
    if intent.topic:
        questions.sort(key=lambda item: intent.topic.lower() not in item["focus_area"].lower())
    questions = questions[:count]
    if intent.concise:
        for item in questions:
            item["answer"] = _first_sentence(item["answer"])
            item["follow_up_questions"] = item["follow_up_questions"][:1]
            item["key_points"] = item["key_points"][:2]
            item["answer_structure"] = item["answer_structure"][:3]

    headline = (
        f"{count} questions for {'this role' if role == _GENERIC_ROLE else role}{co}: gap topics ({_join(weak, 2)}) first, then your strongest stories."
        if weak
        else f"{count} questions for {'this role' if role == _GENERIC_ROLE else role}{co}, built around your strongest stories."
    )
    notes = []
    top = _top_resume_fact(resume)
    if top:
        notes.append(f'Lead with the strongest matching story: "{_trim(top, 100)}".')
    if weak:
        notes.append(f"Be ready to be upfront about {_join(weak, 2)} and show how you would close the gap.")
    if facts:
        notes.append(f'Your confirmed evidence ("{_trim(facts[0], 80)}") is a safe story to reuse.')
    if feedback:
        notes.append(f'Adjusted for your note: "{_trim(feedback, 100)}".')

    result = {
        "schema_version": "quality_v2",
        "summary": {
            "headline": headline,
            "verdict": "Gap-first practice plan" if weak else "Confidence-building practice plan",
            "confidence_note": "Advisory practice plan based on resume and role signals.",
        },
        "top_actions": [
            {
                "title": f"Rehearse {(weak or pool)[0]} out loud",
                "action": (
                    f"Practice your answer on {weak[0]} until it fits in under 90 seconds."
                    if weak
                    else f"Practice your strongest {pool[0]} story until it fits in under 90 seconds."
                ),
                "priority": "high",
            }
        ],
        "questions": questions,
        "focus_areas": [
            {
                "title": focus,
                "reason": (
                    f"{_the_posting(role)} names {focus}, and your resume does not show it yet."
                    if focus in weak
                    else f"{_upper_first(_the_role(role))} leans on {focus}; interviewers will probe for specifics."
                ),
                "requirements_used": [focus],
                "practice_first": focus in weak,
            }
            for focus in pool
        ],
        "weak_signals_to_prepare": [
            {
                "title": keyword,
                "severity": "high" if index == 0 else "medium",
                "why_it_matters": f"The posting asks for {keyword}; no resume evidence for it was detected.",
                "prep_action": f"Prepare one example that links {keyword} to your {adjacent} experience.",
                "related_requirements": [keyword],
            }
            for index, keyword in enumerate(weak[:4])
        ],
        "interviewer_notes": notes[:4] or ["Lead with the strongest matching story before adjacent experience."],
    }
    return _reflect_feedback(
        result,
        intent,
        keep={"focus_areas": 2, "weak_signals_to_prepare": 2, "interviewer_notes": 2, "top_actions": 1},
        shorten=("reason", "why_it_matters", "prep_action", "action"),
    )


_STOPWORDS = frozenset(
    {
        "about", "would", "could", "should", "their", "there", "which", "where", "while", "these",
        "those", "describe", "explain", "time", "tell", "what", "when", "your", "you", "with",
        "from", "that", "this", "have", "were", "been", "into", "than", "then", "them", "they",
    }
)  # fmt: skip
# Never worth "the reference answer also touches on ...": filler words, and the words of
# the generic answer outline every reference answer shares.
_NOT_A_TOPIC = frozenset(
    {
        "through", "between", "because", "without", "against", "however", "whether", "already",
        "another", "towards", "upfront", "something", "anything", "everything", "actually",
        "usually", "probably", "especially", "including", "situation", "options", "weighed",
        "decision", "results", "outcome", "outcomes", "approach", "example", "specific",
    }
)  # fmt: skip
# "cut it by a third", "doubled the cadence": a size stated in words is still a number.
_WORD_QUANTITY = re.compile(
    r"\b(?:by\s+)?(?:a\s+(?:third|quarter|half)|half|twice|three times|four times|ten times|"
    r"doubled|tripled|quadrupled|halved)\b",
    re.I,
)
_RESULT_VERBS = re.compile(
    r"\b(reduced|cut|increased|improved|saved|shipped|launched|grew|delivered|lifted|raised|decreased|doubled|halved)\b", re.I
)


def _question_quote(question: str) -> str:
    """The question itself, whole: its asking sentence ("How would you ...?") rather than the setup before it.

    A question that quotes the resume keeps its inner quotes as single ones, never nested doubles.
    """
    sentences = [part for part in re.split(r"(?:(?<=[.!?])|(?<=[.!?][\"'”’]))\s+(?=[A-Z\"'“])", " ".join(question.split())) if part]
    asking = next((part for part in reversed(sentences) if part.endswith("?")), sentences[0] if sentences else "")
    return _trim(asking, 160).rstrip(".?! ").replace('"', "'") or "this question"


def _interview_practice_feedback(system_prompt: str, user_prompt: str) -> dict:
    question = _section(user_prompt, "Interview Question")
    answer = _section(user_prompt, "User Answer")
    model_answer = _section(user_prompt, "Model Answer")
    # A question that quotes the resume keeps its inner quotes as single ones, never nested doubles.
    quoted_question = _question_quote(question)

    if "(No answer provided)" in user_prompt or not answer:
        return {
            "strengths": [],
            "weaknesses": [],
            "suggestions": [
                f'Open with the specific situation behind "{quoted_question}" and your role in it.',
                "State the concrete action you took, not just the goal.",
                "Close with a measurable result and what you would repeat or change.",
            ],
            "overall_feedback": (
                f'No answer was submitted for "{quoted_question}". Use the structure above to build one before your next attempt.'
            ),
            "is_empty_answer": True,
        }

    words = answer.split()
    count = len(words)
    number = re.search(r"\b\d[\d,.]*\s?(?:%|percent)", answer) or re.search(r"\b\d[\d,.]*(?:\s+[a-z]+)?", answer)
    quantity = None if number else _WORD_QUANTITY.search(answer)
    result_verb = _RESULT_VERBS.search(answer)
    i_count = len(re.findall(r"\bI\b", answer))
    we_count = len(re.findall(r"\b(?:we|our|us)\b", answer, re.I))
    topic_words = {
        word for word in re.findall(r"[a-z]{5,}", question.lower()) if word not in _STOPWORDS
    }
    answer_words = set(re.findall(r"[a-z]{5,}", answer.lower()))
    on_topic = topic_words & answer_words

    strengths: list[str] = []
    weaknesses: list[str] = []
    suggestions: list[str] = []
    if number:
        strengths.append(f'You back the result with a number ("{number.group(0).strip(" .,")}"), which is what makes it believable.')
    elif quantity:
        strengths.append(f'You size the result ("{quantity.group(0).strip()}"), which is what makes it believable.')
    else:
        weaknesses.append("The result has no number: say how much, how fast or how many.")
        suggestions.append("Add one measurable outcome to close the answer, even a rough one.")
    if result_verb:
        strengths.append(f'You state an outcome with a clear verb ("{result_verb.group(0).lower()}").')
    elif not (number or quantity):
        weaknesses.append("It describes the situation but never states what changed afterwards.")
    if i_count >= 2 and i_count >= we_count:
        strengths.append(f'Clear first-person ownership: "I" appears {i_count} times.')
    elif we_count > i_count:
        weaknesses.append('The answer leans on "we"; say what you personally did.')
        suggestions.append('Swap one "we" for "I" and name your own decision.')
    if count < 25:
        weaknesses.append(f"At {count} words it is too short to show the situation, your action and the result; add detail.")
        suggestions.append("Aim for 90 to 150 words: one line of setup, two of action, one of result.")
    elif count > 180:
        weaknesses.append(f"At {count} words it runs long; the action and result get buried under setup.")
        suggestions.append("Trim the setup so the action and result get more airtime.")
    else:
        strengths.append(f"A good length: about {count} words, roughly {max(1, round(count / 130 * 60))} seconds spoken.")
    if topic_words and not on_topic and count >= 40:
        weaknesses.append(f'It does not speak to what the question asks ("{quoted_question}").')
        suggestions.append("Restate the question's core in your first sentence, then answer it directly.")
    if model_answer:
        gaps = [
            w
            for w in re.findall(r"[a-z]{7,}", model_answer.lower())
            if w not in answer_words and w not in _STOPWORDS and w not in _NOT_A_TOPIC
        ]
        if gaps:
            suggestions.append(f'The reference answer also touches on "{gaps[0]}"; consider working it in.')
    if not strengths:
        strengths.append(f'Your opening, "{_trim(" ".join(words[:8]), 60)}", gives a clear place to start.')
    if not suggestions:
        suggestions.append("Practise saying it out loud to keep the delivery under two minutes.")

    verdict = "A solid answer" if not weaknesses else "A start with clear fixes" if len(weaknesses) == 1 else "A rough first pass"
    return {
        "strengths": strengths[:4],
        "weaknesses": weaknesses[:4],
        "suggestions": suggestions[:4],
        # With nothing to fix the verdict is the whole message; "Biggest fix: nothing" contradicts itself.
        "overall_feedback": f'{verdict} on "{quoted_question}".'
        + (f" Biggest fix: {_lower_first(weaknesses[0]).rstrip('.')}." if weaknesses else ""),
        "is_empty_answer": False,
    }


# ---------------------------------------------------------------------------
# Career Path — marker from app/prompts/career.py build_career_prompt
# ---------------------------------------------------------------------------

_MARKER_CAREER = "You are an expert career strategist."

_MIN_DIRECTIONS = 3


def _stated_target_role(user_prompt: str) -> str:
    # The prompt builder writes the literal placeholder "None provided" when the
    # user left the target blank; that is "no target", never a role to echo.
    raw = _line_after(user_prompt, "## Stated target role\n")
    return "" if _is_blank(raw) else raw


def _top_up_directions(paths: list[dict], discipline: str, strengths: list[str]) -> list[dict]:
    """Guarantee at least three distinct directions, derived from the discipline."""
    existing = {str(path.get("role_title", "")).lower() for path in paths}
    base = min((int(p.get("fit_score", 70)) for p in paths), default=72)
    extras = [
        (f"Senior {discipline.title()} Specialist", "3-6 months", "low"),
        (f"{discipline.title()} Team Lead", "6-12 months", "medium"),
        (f"{discipline.title()} Consultant", "6-9 months", "medium"),
    ]
    for offset, (title, timeline, risk) in enumerate(extras, start=1):
        if len(paths) >= _MIN_DIRECTIONS:
            break
        if title.lower() in existing:
            continue
        paths.append(
            {
                "role_title": title,
                "fit_score": max(35, base - 3 * offset),
                "transition_timeline": timeline,
                "rationale": f"A lateral option that reuses your {discipline} background.",
                "strengths_to_leverage": strengths[:3] or ["Existing domain experience"],
                "gaps_to_close": ["A visible proof project for the target scope"],
                "risk_level": risk,
            }
        )
    return paths


def _gap_reason(role: str, gap: str, strength: str, resume: _Resume) -> str:
    """Why a gap matters, citing a strength only when the resume text actually shows it."""
    if strength and keyword_present(strength, "\n".join(resume.lines)):
        bullet = resume.bullet_with(strength)
        proof = f' ("{_trim(bullet.text, 70)}")' if bullet else ""
        return f"{role} hiring teams look for {gap}. Your resume proves {strength}{proof}, but nothing on it shows {gap} yet."
    return f"{role} hiring teams look for {gap}, and nothing on your resume shows it yet."


def _career(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    helper = _json_after(user_prompt, "## Helper signals") or {}
    resume = _parse_resume(_resume_text(user_prompt))
    discipline = str(helper.get("discipline_label") or "your current discipline")
    seniority = str(helper.get("seniority_label") or "").strip()
    years = helper.get("years_experience") or resume.years
    skills = _string_list(helper.get("detected_skills")) or resume.skills
    target_role = _stated_target_role(user_prompt)
    facts = _confirmed_facts(user_prompt)
    feedback = _feedback(user_prompt)

    # Start from the deterministic baseline directions (they already follow the
    # resume's discipline, seniority and skills) and write the narrative on top.
    paths = [dict(path) for path in (locked.get("paths") or []) if isinstance(path, dict) and path.get("role_title")]
    paths = _top_up_directions(paths, discipline, skills)
    if target_role and not any(str(p["role_title"]).lower() == target_role.lower() for p in paths):
        paths.insert(
            0,
            {
                "role_title": target_role,
                "fit_score": max(40, int(paths[0].get("fit_score", 70)) - 2) if paths else 65,
                "transition_timeline": "6-12 months",
                "rationale": "The role you named, so the gaps below are measured against it.",
                "strengths_to_leverage": skills[:3] or ["Existing domain experience"],
                "gaps_to_close": ["A visible proof project for the target scope"],
                "risk_level": "medium",
            },
        )
    paths = paths[:5]

    # Distinct, descending fit scores; the baseline can tie.
    paths.sort(key=lambda path: int(path.get("fit_score", 0)), reverse=True)
    for index in range(1, len(paths)):
        if int(paths[index]["fit_score"]) >= int(paths[index - 1]["fit_score"]):
            paths[index]["fit_score"] = max(1, int(paths[index - 1]["fit_score"]) - 1)

    evidence = [bullet.text.rstrip(". ") for bullet in (resume.quantified or resume.bullets)]
    for index, path in enumerate(paths):
        if evidence:
            path["rationale"] = (
                f"{str(path.get('rationale', '')).rstrip()} "
                f'Evidence from your resume: "{_trim(evidence[index % len(evidence)], 110)}".'
            ).strip()

    # The recommendation is the best-scored direction, as in the heuristic baseline; a role the
    # person named that scores lower stays in the list with its own fit and gaps.
    chosen = paths[0]
    named = next((p for p in paths if target_role and str(p["role_title"]).lower() == target_role.lower()), None)
    role = str(chosen["role_title"])
    fit = int(chosen["fit_score"])
    strengths = _string_list(chosen.get("strengths_to_leverage")) or skills[:3]
    gaps = _string_list(chosen.get("gaps_to_close")) or ["A visible proof project for the target scope"]
    timeline = str(chosen.get("transition_timeline") or "3-6 months")

    background = f"{years} years in {discipline}" if years else f"Your {discipline} background"
    why_now = f"{background[0].upper() + background[1:]} and your {_join(strengths, 3)} already cover most of what {role} expects."
    if evidence:
        why_now += f' Your strongest proof today: "{_trim(evidence[0], 110)}".'
    if facts:
        why_now += f' You have also confirmed: "{_trim(facts[0], 100)}".'
    if seniority:
        why_now += f" That reads as {_a(seniority.lower())} profile."
    if named is not None and named is not chosen:
        why_now += (
            f" You named {named['role_title']}: it fits at {int(named['fit_score'])}% today, "
            "so it is listed below with the gaps to close first."
        )

    gap_guides = [
        "Ship one visible project or write-up that exercises {gap} end to end, then add it to your resume.",
        "Lead a small change in your current team that needs {gap}, and record the measurable result.",
        "Take a stretch task around {gap} and write up what you decided and why.",
    ]
    skill_gaps = [
        {
            "skill": gap,
            "urgency": "high" if index == 0 else "medium",
            "why_it_matters": _gap_reason(role, gap, strengths[index % len(strengths)] if strengths else "", resume),
            "how_to_build": gap_guides[index % len(gap_guides)].format(gap=gap),
        }
        for index, gap in enumerate(gaps[:3])
    ]

    other = next((str(p["role_title"]) for p in paths if p is not chosen), role)
    next_steps = [
        {"timeframe": "This month", "action": f"Write a one-page proof plan for {gaps[0]}, scoped for {role}."},
        {"timeframe": "Next quarter", "action": f"Ship the {gaps[0]} proof piece and add it to your resume as a quantified bullet."},
        {"timeframe": f"Within {timeline}", "action": f"Start applying for {role} roles, with {other} as your fallback target."},
    ]

    headline = (
        f"{role} is the clearest next move: your {_join(strengths, 2)} already carry over, "
        f"and the gaps ({_join(gaps, 2)}) are specific."
    )
    note = "Advisory, evidence-based read on your resume and target role."
    if feedback:
        note = f'Re-read with your note in mind: "{_trim(feedback, 100)}".'
    result = {
        "schema_version": "planning_v1",
        "summary": {"headline": headline, "verdict": "Best next move identified", "confidence_note": note},
        "top_actions": [
            {"title": f"Close the {gaps[0]} gap", "action": next_steps[0]["action"], "priority": "high"},
            {"title": "Put the proof on your resume", "action": next_steps[1]["action"], "priority": "medium"},
        ],
        "recommended_direction": {
            "role_title": role,
            "fit_score": fit,
            "transition_timeline": timeline,
            "why_now": why_now,
            "confidence": "high" if fit >= 80 else "medium" if fit >= 65 else "low",
        },
        "paths": paths,
        "target_skills": _unique([gap for path in paths for gap in _string_list(path.get("gaps_to_close"))])[:6],
        "skill_gaps": skill_gaps,
        "next_steps": next_steps,
    }
    return _reflect_feedback(
        result,
        _feedback_intent(feedback),
        keep={"skill_gaps": 2, "next_steps": 2, "top_actions": 1, "paths": 5},
        shorten=("why_it_matters", "how_to_build", "rationale", "action"),
        focus_action=f"Tell your move to {role} through {{topic}} first: one story where you showed it, and one way to show more of it.",
    )


# ---------------------------------------------------------------------------
# Portfolio Planner — marker from app/prompts/portfolio.py build_portfolio_prompt
# ---------------------------------------------------------------------------

_MARKER_PORTFOLIO = "You are an expert portfolio strategist and technical mentor."

_COMPLEXITY_RANK = {"foundational": 1, "intermediate": 2, "advanced": 3}
_STEP_REASONS = [
    "Start here: {t} is the fastest credible proof for {r}{reuse}.",
    "Build {t} next, once the first project gives you a stable story and reusable assets.",
    "{t} comes last, once the earlier work has closed the biggest proof gaps.",
    "Add {t} only after the earlier pieces are visible and polished.",
]


def _portfolio(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    helper = _json_after(user_prompt, "## Helper signals") or {}
    target_role = _line_after(user_prompt, "## Target Role\n")
    stated_role = not _is_blank(target_role)
    target_role = target_role if stated_role else "the target role"
    a_role = f"a {target_role}" if stated_role else target_role
    resume = _parse_resume(_resume_text(user_prompt))
    focus_skills = _string_list(helper.get("focus_skills")) or ["Systems design", "Testing", "Communication"]
    own_skills = _string_list(helper.get("detected_skills")) or resume.skills
    feedback = _feedback(user_prompt)

    projects = [dict(p) for p in (locked.get("projects") or []) if isinstance(p, dict) and p.get("project_title")]
    if len(projects) < 3:
        # No usable baseline: shape three projects from the role and its focus skills.
        projects = [
            {
                "project_title": f"{skill} proof project for {target_role}",
                "description": f"Build a small, complete piece of work that demonstrates {skill} for {a_role}.",
                "skills": focus_skills[:4],
                "complexity": ["foundational", "intermediate", "advanced"][index],
                "why_this_project": f"It gives a reviewer concrete proof of {skill}.",
                "deliverables": ["Working demo", "Short write-up", "Public repo"],
                "hiring_signals": [f"Can own {skill} end to end"],
                "estimated_timeline": ["2-3 weeks", "3-4 weeks", "4-6 weeks"][index],
            }
            for index, skill in enumerate(focus_skills[:3])
        ]

    own_lower = {skill.lower() for skill in own_skills}
    for project in projects:
        overlap = next((s for s in _string_list(project.get("skills")) if s.lower() in own_lower), "")
        bullet = resume.bullet_with(overlap) if overlap else None
        if overlap:
            quote = f' (your resume: "{_trim(bullet.text, 80)}")' if bullet else ""
            project["description"] = f"{str(project.get('description', '')).rstrip()} It builds on the {overlap} work you already have{quote}."
            project["_reuse"] = overlap
    projects.sort(key=lambda p: _COMPLEXITY_RANK.get(str(p.get("complexity")), 99))
    projects = projects[:4]

    plan = []
    for index, project in enumerate(projects):
        reuse = f" and builds on your {project['_reuse']} experience" if project.get("_reuse") else ""
        plan.append(
            {
                "order": index + 1,
                "project_title": project["project_title"],
                "reason": _STEP_REASONS[index].format(t=project["project_title"], r=target_role, reuse=reuse),
            }
        )
    for project in projects:
        project.pop("_reuse", None)

    start = str(projects[0]["project_title"])
    last = str(projects[-1]["project_title"])
    note = "Advisory portfolio guidance based on resume evidence and role-fit heuristics."
    if feedback:
        note = f'Re-planned with your note in mind: "{_trim(feedback, 100)}".'
    signals = _string_list(projects[0].get("hiring_signals"))
    result = {
        "schema_version": "planning_v1",
        "summary": {
            "headline": f"{len(projects)} projects for {target_role}, from {start} to {last}.",
            "verdict": "Proof roadmap ready",
            "confidence_note": note,
        },
        "top_actions": [
            {
                "title": f"Start {start}",
                "action": f"Scope {start} down to something shippable in {projects[0].get('estimated_timeline') or 'a few weeks'}.",
                "priority": "high",
            },
            {
                "title": "Write it up as you go",
                "action": f"Capture the trade-offs from {start} in a short write-up you can link from your resume.",
                "priority": "medium",
            },
        ],
        "target_role": target_role,
        "portfolio_strategy": {
            "headline": f"Build a compact proof set that makes you look credible for {target_role}.",
            "focus": f"Prioritize {focus_skills[0]} first, then layer in {focus_skills[min(2, len(focus_skills) - 1)]}"
            + (f", building on your {_join(own_skills, 2)}." if own_skills else "."),
            "proof_goal": (
                f"Make it easy for a reviewer to say this person can already operate like {a_role}."
                if stated_role
                else "Make it easy for a reviewer to say this person already operates at the level the target role expects."
            ),
        },
        "projects": projects,
        "recommended_start_project": start,
        "sequence_plan": plan,
        "presentation_tips": [
            f"Lead with a 30-second demo of {start} before any code walkthrough.",
            f"Name the hardest trade-off you made in {last} and why.",
            (
                f'Open each README with the hiring signal it proves, such as "{signals[0].rstrip(".")}".'
                if signals
                else "Tie each project back to the role in the first line of the README."
            ),
        ],
    }
    return _reflect_feedback(
        result,
        _feedback_intent(feedback),
        keep={"projects": 4, "sequence_plan": 4, "presentation_tips": 1, "top_actions": 1},
        shorten=("description", "why_this_project", "reason", "action"),
        sub_keep={"deliverables": 2, "hiring_signals": 1, "skills": 3},
        focus_action=f"Shape {start} so it shows {{topic}}: decide what you will own, who you will bring along and how you will report the result.",
    )


# ---------------------------------------------------------------------------
# CV Studio: Tailoring — inline system prompt in app/services/cv_tailoring.py
# ---------------------------------------------------------------------------

_MARKER_CV_TAILORING = "Propose only truthful reframing grounded in existing CV text or confirmed evidence."


def _cv_tailoring(system_prompt: str, user_prompt: str) -> dict:
    job_title = _line_after(user_prompt, "Target title:") or "the target role"
    sections = _json_after(user_prompt, "Structured document:\n") or []
    job_text = user_prompt.split("Job description:\n", 1)[-1].split("\nStructured document:", 1)[0]
    terms = extract_job_keywords(job_text, limit=12)

    def change_for(section: dict, entry: dict, field: str, before: str, after: str, requirement: str) -> dict:
        return {
            "id": f"tailor-{section.get('id')}-{entry.get('id')}"[:100],
            "section_id": section.get("id"),
            "entry_id": entry.get("id"),
            "field": field,
            "before": before,
            "after": after[:4999],
            "job_requirement": requirement,
            "evidence_item_ids": [],
            "support": "document",
        }

    changes: list[dict[str, Any]] = []
    used: set[str] = set()
    for section in sections:
        for entry in (section.get("entries") or [])[:3]:
            # A bullet-bearing structured entry renders its bullets, not its body
            # (#322), so rewrite a bullet when there is one.
            bullets = entry.get("bullets") or []
            candidates = (
                [(f"bullets[{index}]", str(text)) for index, text in enumerate(bullets[:6])]
                if bullets
                else [("body", str(entry.get("body", "")))]
            )
            for target, before in candidates:
                if not before:
                    continue
                after, term = _reframe(before, terms, used, skills_list=section.get("kind") == "skills")
                if term:
                    used.add(term.lower())
                    changes.append(change_for(section, entry, target, before, after, f"Demonstrated {term} experience"))
                    break
            if len(changes) >= 4:
                return {"changes": changes}

    if not changes:
        # Nothing can be reordered to foreground a posting term without inventing
        # a claim or padding the user's wording: propose the first entry unchanged and say so.
        for section in sections:
            for entry in (section.get("entries") or [])[:1]:
                bullets = entry.get("bullets") or []
                field, before = ("bullets[0]", str(bullets[0])) if bullets else ("body", str(entry.get("body", "")))
                if before:
                    requirement = f"General fit for {job_title}: no posting term appears here, so the wording is left as written."
                    return {"changes": [change_for(section, entry, field, before, before, requirement)]}
    return {"changes": changes}


_FRONTABLE_PREPOSITIONS = re.compile(r"\b(?:through|using|with|via|in|on|across|by)\s", re.I)


def _lower_first(text: str) -> str:
    first = text.split(" ", 1)[0]
    return text if (first.isupper() and len(first) > 1) else text[:1].lower() + text[1:]


def _front_phrase(text: str, term: str) -> str:
    """Move the prepositional phrase that carries ``term`` to the front, keeping every word.

    ``Built REST APIs in Python serving 3 million users.`` becomes
    ``In Python, built REST APIs serving 3 million users.`` Returns "" when the term is
    not in a movable phrase (already first, or no preposition leads into it).
    """
    body = text.rstrip(". ")
    index = body.lower().find(term.lower())
    if index < 0:
        return ""
    starts = [m.start() for m in _FRONTABLE_PREPOSITIONS.finditer(body) if 0 < m.start() < index and "," not in body[m.start() : index]]
    if not starts:
        return ""
    start = starts[-1]
    end = index + len(term)
    # "Python and SQL", "Python, SQL or Go": the moved phrase carries the whole list, never half of it.
    # Only a skill-shaped conjunct ("SQL", "C++", "Node.js") joins the list: "and cut latency" or
    # "and reduced costs" starts the next clause and stays where it is.
    coordinated = re.match(r"(?:(?:\s*,\s*[A-Z0-9][\w+#./-]*)+,?)?\s+(?:and|or|&)\s+[A-Z0-9][\w+#./-]*", body[end:])
    if coordinated and not any(
        _past_tense(word) or word.lower().endswith("ing")
        for word in re.findall(r"[A-Za-z][\w+#./-]*", coordinated.group())
        if word.lower() not in ("and", "or")
    ):
        end += coordinated.end()
    trailing = re.match(r"\s+[\w-]+(?=\s*(?:,|$))", body[end:])
    if trailing:
        end += trailing.end()
    head = body[:start].rstrip(" ,")
    if len(head.split()) < 2:
        return ""
    # Only an action turns around ("Built ..." -> "In Python, built ..."); a noun phrase such as
    # "Backend engineer with six years of Python" would read inside out.
    first = head.split(" ", 1)[0]
    if not (_past_tense(first) or first.lower().endswith("ing")):
        return ""
    tail = body[start:end]
    return f"{tail[:1].upper()}{tail[1:]}, {_lower_first(head)}{body[end:]}."


def _reframe(before: str, terms: list[str], used: set[str], *, skills_list: bool) -> tuple[str, str]:
    """A truthful rewrite that foregrounds a posting term the text already contains.

    It only reorders the user's own words (never adds or drops one).
    """
    for term in terms:
        if term.lower() in used or not keyword_present(term, before):
            continue
        if skills_list:
            # Reorder only: lead the list with the term, never add one.
            parts = [part.strip() for part in before.split(",")]
            lead = next((p for p in parts if keyword_present(term, p)), "")
            if len(parts) < 2 or not lead or parts[0] == lead:
                continue
            return ", ".join([lead] + [p for p in parts if p != lead]), term
        fronted = _front_phrase(before, term)
        if fronted:
            return fronted, term
    return before, ""


# ---------------------------------------------------------------------------
# Evidence Profile import — marker from app/prompts/evidence_import.py
# ---------------------------------------------------------------------------

_MARKER_EVIDENCE_IMPORT = "You are an information-extraction assistant for a career workbench."


def _evidence_import(system_prompt: str, user_prompt: str) -> dict:
    # Only facts that are actually in the text: a thin resume yields fewer items,
    # never placeholders (the prompt forbids padding with guesses).
    resume = _parse_resume(user_prompt.split("RESUME TEXT:\n", 1)[-1])
    proposals: list[dict] = []

    for role, employer in resume.roles[:6]:
        content = {"role": role, "employer": employer}
        first = next((b.text for b in resume.bullets if b.employer == employer), "")
        if first:
            content["summary"] = _trim(first, 200)
        proposals.append({"kind": "experience", "content": content})
    for skill in resume.skills[:10]:
        proposals.append({"kind": "skill", "content": {"name": skill}})
    for bullet in resume.quantified[:5]:
        content = {"statement": bullet.text[:200]}
        if bullet.employer:
            content["employer"] = bullet.employer
        proposals.append({"kind": "achievement", "content": content})
    if resume.education:
        proposals.append({"kind": "education", "content": {"summary": resume.education[:200]}})
    return {"proposals": proposals}


# ---------------------------------------------------------------------------
# Application drafts: cover letter + screening answers — SYSTEM_PROMPT
# in app/services/application_drafts.py
# ---------------------------------------------------------------------------

_MARKER_APPLICATION_DRAFTS = "You prepare an application's cover letter and screening-answer drafts."


def _application_drafts(system_prompt: str, user_prompt: str) -> dict:
    role_line = f" {_line_after(user_prompt, '# Role' + chr(10))} "
    title, _, company = role_line.partition(" at ")
    title, company = title.strip(), company.strip()
    listing = user_prompt.split("# Listing\n", 1)[-1].split("\n\n# Candidate CV", 1)[0]
    cv_text = user_prompt.split("# Candidate CV\n", 1)[-1].split("\n\n# Evidence boundary", 1)[0]
    resume = _parse_resume(cv_text)
    if not title:
        title = _job_header(listing)[0] or extract_role_label(listing) or ""
    role = title or "this role"
    shared = [term for term in extract_job_keywords(listing, limit=12) if keyword_present(term, cv_text)]
    proof = resume.quantified[0] if resume.quantified else (resume.bullets[0] if resume.bullets else None)
    proof2 = resume.quantified[1] if len(resume.quantified) > 1 else None

    where = f" at {company}" if company else ""
    sentences = [f"I'm applying for {_the_role(role)}{where}."]
    if proof:
        place = f"At {proof.employer}, " if proof.employer else "Recently, "
        sentences.append(f"{place}{proof.clause()}.")
    if shared:
        sentences.append(f"That is the same {_join(shared, 3)} work the listing describes.")
    sentences.append(f"I'd welcome the chance to talk through how that applies to {company or 'your team'}.")

    fit_parts = [f"The scope of {_the_role(role)} lines up with work I have already done"]
    if proof:
        fit_parts.append(f": {proof.clause()}")
    fit_answer = "".join(fit_parts) + (f". I also bring {_join(shared, 3)}." if shared else ".")

    history: list[str] = []
    if resume.years:
        history.append(f"{resume.years} years of experience")
    if resume.current_title:
        history.append(f"most recently as {resume.current_title}" + (f" at {resume.roles[0][1]}" if resume.roles else ""))
    experience_answer = ", ".join(history) if history else "My background is in the CV attached to this application"
    if proof2:
        experience_answer += (
            f". I also {proof2.clause()[2:]}" if proof2.clause().startswith("I ") else f". {_upper_first(proof2.clause())}"
        )
    experience_answer = experience_answer[0].upper() + experience_answer[1:] + "."
    screening = [
        {
            "question": "Why are you a good fit for this role?",
            "answer": fit_answer,
            "support": "document",
            "evidence_item_ids": [],
        },
        {
            "question": "What relevant experience do you bring to this position?",
            "answer": experience_answer,
            "support": "document",
            "evidence_item_ids": [],
        },
    ]
    # Questions a real form asks when the listing raises the topic. The answer is left
    # empty: these are stop questions only the applicant may answer.
    if re.search(r"\b(?:salary|compensation|pay range|pay band)\b", listing, re.I):
        screening.append({"question": "What are your salary expectations?", "answer": "", "support": "unsupported", "evidence_item_ids": []})
    if re.search(
        r"\bsponsorship\b|\bsponsor\w*\s+(?:\w+\s+){0,2}visas?\b|\b(?:work|working|employment)\s+visas?\b|\bvisa\s+status\b"
        r"|\bright\s+to\s+work\b|\bwork\s+authori[sz]ation\b",
        listing,
        re.I,
    ):
        screening.append({"question": "Do you require visa sponsorship?", "answer": "", "support": "unsupported", "evidence_item_ids": []})
    return {
        "cover_letter": {
            "body": " ".join(sentences),
            "support": "document",
            "evidence_item_ids": [],
        },
        "screening_answers": screening,
    }

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_REGISTRY: list[tuple[str, Callable[[str, str], dict]]] = [
    (_MARKER_CV_TAILORING, _cv_tailoring),
    (_MARKER_EVIDENCE_IMPORT, _evidence_import),
    (_MARKER_APPLICATION_DRAFTS, _application_drafts),
    (_MARKER_RESUME, _resume_analyzer),
    (_MARKER_JOB_MATCH, _job_matcher),
    (_MARKER_COVER_LETTER, _cover_letter),
    (_MARKER_INTERVIEW_PRACTICE, _interview_practice_feedback),
    (_MARKER_INTERVIEW_QUESTIONS, _interview_questions),
    (_MARKER_CAREER, _career),
    (_MARKER_PORTFOLIO, _portfolio),
]


async def fake_complete_structured(
    system_prompt: str,
    user_prompt: str,
    schema: dict | None = None,
    model_override: str | None = None,
) -> dict:
    """Return a deterministic, schema-valid fixture for the calling prompt.

    Matches the same ``(system_prompt, user_prompt, schema=None,
    model_override=None) -> dict`` shape as ``complete_structured`` so
    ``ai_client._call_fake`` can await it directly. Dispatch is by system-prompt
    marker substring (see module docstring) rather than an explicit caller
    hint, so every existing call site works unmodified.
    """
    for marker, builder in _REGISTRY:
        if marker in system_prompt:
            return builder(system_prompt, user_prompt)
    raise ValueError(
        "LLM_PROVIDER=fake has no registered fixture for this prompt. Add a "
        "marker + builder in app/services/fake_llm.py for the new caller."
    )
