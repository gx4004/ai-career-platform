from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.skill_vocabulary import EXTRA_SKILL_PATTERNS, SQL_FLAVOUR_LABELS

SECTION_PATTERNS: dict[str, tuple[str, ...]] = {
    "Summary": (
        r"\bprofessional summary\b",
        r"\bsummary\b",
        r"\bprofile\b",
        r"\babout\b",
    ),
    "Experience": (
        r"\bexperience\b",
        r"\bwork history\b",
        r"\bemployment\b",
        r"\bprofessional experience\b",
    ),
    "Skills": (
        r"\bskills\b",
        r"\btechnical skills\b",
        r"\bcore competencies\b",
        r"\btechnologies\b",
    ),
    "Projects": (
        r"\bprojects\b",
        r"\bproject experience\b",
        r"\bselected projects\b",
        r"\bportfolio\b",
    ),
    "Education": (
        r"\beducation\b",
        r"\bacademic\b",
        r"\bqualifications\b",
    ),
    "Certifications": (
        r"\bcertifications\b",
        r"\blicenses\b",
        r"\bcertificates\b",
    ),
}

SKILL_PATTERNS: dict[str, tuple[str, ...]] = {
    "Python": (r"\bpython\b",),
    "SQL": (
        r"\bsql\b",
        r"\bpostgresql\b",
        r"\bpostgres\b",
        r"\bmysql\b",
        r"\bsqlite\b",
        r"\bt-sql\b",
        r"\btsql\b",
        r"\bmssql\b",
        r"\bsql server\b",
    ),
    "FastAPI": (r"\bfastapi\b",),
    "APIs": (r"\bapi\b", r"\bapis\b", r"\brestful\b", r"\brest apis?\b"),
    "JavaScript": (r"\bjavascript\b", r"(?<![.\w])js\b", r"\becmascript\b"),
    "TypeScript": (r"\btypescript\b",),
    "React": (r"\breact\b",),
    "Node.js": (r"\bnode(?:\.js)?\b",),
    "AWS": (r"\baws\b", r"\bamazon web services\b"),
    "Azure": (r"\bazure\b",),
    "GCP": (r"\bgcp\b", r"\bgoogle cloud\b"),
    "Docker": (r"\bdocker\b",),
    "Kubernetes": (r"\bkubernetes\b", r"\bk8s\b"),
    "CI/CD": (r"\bci/cd\b", r"\bcicd\b", r"\bjenkins\b", r"\bgithub actions\b"),
    "Testing": (r"\btest automation\b", r"\btesting\b", r"\bpytest\b", r"\bunit tests?\b"),
    "Data Analysis": (r"\bdata analysis\b", r"\banalytics\b", r"\banalysis\b"),
    "Machine Learning": (r"\bmachine learning\b", r"\bml\b", r"\bai\b"),
    "System Design": (r"\bsystem design\b",),
    "Leadership": (r"\bleadership\b", r"\bmentor(?:ing)?\b", r"\bcoached\b"),
    "Communication": (r"\bcommunication\b", r"\bstakeholder\b", r"\bcross-functional\b"),
    "Product Strategy": (r"\bproduct strategy\b", r"\broadmap\b", r"\bprioritization\b"),
    "Project Management": (r"\bproject management\b", r"\bprogram management\b"),
    "Accessibility": (r"\baccessibility\b", r"\ba11y\b"),
    "Figma": (r"\bfigma\b",),
    "Design Systems": (r"\bdesign systems?\b",),
}

COMMON_KEYWORD_PHRASES = (
    "system design",
    "cloud deployment",
    "stakeholder management",
    "cross-functional collaboration",
    "data analysis",
    "product strategy",
    "project management",
    "design systems",
    "user research",
    "test automation",
    "continuous integration",
    "continuous delivery",
    "performance optimization",
    "technical leadership",
    "mentoring",
    "communication",
    "experimentation",
    "roadmap planning",
    "api design",
    "backend development",
    "frontend development",
)

STOPWORDS = {
    "about",
    "across",
    "after",
    "also",
    "and",
    "applicant",
    "build",
    "building",
    "candidate",
    "collaborate",
    "company",
    "deliver",
    "develop",
    "engineer",
    "experience",
    "have",
    "help",
    "including",
    "join",
    "knowledge",
    "looking",
    "must",
    "need",
    "other",
    "our",
    "role",
    "senior",
    "should",
    "skills",
    "strong",
    "team",
    "that",
    "their",
    "this",
    "with",
    "work",
    "years",
    "your",
    # Generic job-posting filler: common verbs/nouns/adjectives that describe
    # the *posting* rather than a resume-checkable skill. Left uncaught, these
    # were being ranked as "missing keywords" against any resume that didn't
    # happen to restate the same filler word (e.g. "Learn", "Ability").
    "ability",
    "abilities",
    "learn",
    "learning",
    "excellent",
    "required",
    "requirement",
    "requirements",
    "preferred",
    "responsibilities",
    "responsibility",
    "qualifications",
    "qualification",
    "familiarity",
    "familiar",
    "proficient",
    "proficiency",
    "understanding",
    "environment",
    "environments",
    "demonstrated",
    "passion",
    "passionate",
    "ideal",
    "plus",
    "detail",
    "details",
    "oriented",
    "motivated",
    "growing",
    "growth",
    "opportunity",
    "opportunities",
    "fast-paced",
    "ensure",
    "ensuring",
    "bachelor",
    "degree",
}

ACTION_VERBS = (
    "built",
    "delivered",
    "launched",
    "led",
    "improved",
    "reduced",
    "increased",
    "optimized",
    "designed",
    "shipped",
    "created",
    "owned",
)

DISCIPLINE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "backend-engineering": (
        "backend",
        "api",
        "apis",
        "service",
        "services",
        "microservice",
        "microservices",
        "database",
        "databases",
        "distributed systems",
        "platform",
        "infra",
        "infrastructure",
        "cloud",
    ),
    "frontend-engineering": (
        "frontend",
        "front-end",
        "ui",
        "ux",
        "web app",
        "web applications",
        "design system",
        "component library",
        "interaction design",
    ),
    "data-analytics": (
        "data analyst",
        "analytics",
        "analysis",
        "reporting",
        "dashboard",
        "dashboards",
        "bi",
        "business intelligence",
        "insights",
        "experimentation",
    ),
    "product-design": (
        "product designer",
        "ux designer",
        "ui designer",
        "design systems",
        "design system",
        "prototype",
        "prototyping",
        "wireframe",
        "wireframes",
        "user research",
        "usability",
    ),
    "product-management": (
        "product manager",
        "product management",
        "roadmap",
        "prioritization",
        "requirements",
        "stakeholder management",
        "go-to-market",
        "product strategy",
    ),
}

DISCIPLINE_LABELS = {
    "backend-engineering": "backend engineering",
    "frontend-engineering": "frontend engineering",
    "full-stack-engineering": "full-stack engineering",
    "data-analytics": "data and analytics",
    "product-design": "product design",
    "product-management": "product management",
    "general-technology": "technology",
}

SENIORITY_LABELS = {
    "entry": "entry-level",
    "mid": "mid-level",
    "senior": "senior",
}


@dataclass
class ResumePrepass:
    detected_sections: list[str]
    detected_skills: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    quantified_bullets: int
    word_count: int
    bullet_lines: int
    action_verb_hits: int
    job_keywords: list[str]
    target_role_label: str | None
    #: Job keywords the posting only lists as nice-to-have (a subset of `job_keywords`).
    preferred_keywords: list[str] = field(default_factory=list)

    def evidence(self) -> dict:
        return {
            "detected_sections": self.detected_sections,
            "detected_skills": self.detected_skills,
            "matched_keywords": self.matched_keywords,
            "missing_keywords": self.missing_keywords,
            "quantified_bullets": self.quantified_bullets,
        }


def clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, value))


def ordered_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = item.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def detect_sections(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for label, patterns in SECTION_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            found.append(label)
    return found


def count_quantified_bullets(text: str) -> int:
    count = 0
    for line in text.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        if re.search(r"(\d+%|\$\d+|\d+\+|\d+\s*(?:years?|months?)|\b\d{2,}\b)", cleaned):
            count += 1
    return count


def count_bullet_lines(text: str) -> int:
    return sum(
        1
        for line in text.splitlines()
        if re.match(r"^\s*(?:[-*•]|[0-9]+\.)\s+", line)
    )


def count_action_verbs(text: str) -> int:
    lowered = text.lower()
    return sum(len(re.findall(rf"\b{re.escape(verb)}\b", lowered)) for verb in ACTION_VERBS)


def extract_detected_skills(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for label, patterns in SKILL_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            found.append(label)
    return found


def infer_resume_years_experience(text: str) -> int | None:
    match = re.search(r"\b(\d{1,2})\+?\s*(?:years?|yrs?)\b", text.lower())
    if not match:
        return None
    years = int(match.group(1))
    return years if years <= 50 else None


def infer_resume_seniority(text: str) -> str:
    lowered = text.lower()
    years = infer_resume_years_experience(text)

    if re.search(r"\b(principal|staff|director|head of|vp|vice president)\b", lowered):
        return "senior"
    if re.search(r"\b(senior|sr\.?|lead|manager)\b", lowered):
        return "senior"
    if re.search(r"\b(junior|jr\.?|intern|graduate|entry level)\b", lowered):
        return "entry"
    if years is not None:
        if years >= 6:
            return "senior"
        if years <= 2:
            return "entry"
    return "mid"


def seniority_label(level: str) -> str:
    return SENIORITY_LABELS.get(level, "mid-level")


def discipline_label(key: str) -> str:
    return DISCIPLINE_LABELS.get(key, "technology")


def infer_resume_discipline(
    text: str,
    detected_skills: list[str] | None = None,
) -> str:
    lowered = text.lower()
    skills = set(detected_skills or [])

    scores = {
        "backend-engineering": 0,
        "frontend-engineering": 0,
        "data-analytics": 0,
        "product-design": 0,
        "product-management": 0,
    }

    for discipline, keywords in DISCIPLINE_KEYWORDS.items():
        scores[discipline] += sum(1 for keyword in keywords if keyword in lowered)

    if {"Python", "SQL", "FastAPI", "APIs", "AWS", "Docker", "Kubernetes", "CI/CD", "System Design"} & skills:
        scores["backend-engineering"] += 5
    if {"JavaScript", "TypeScript", "React", "Accessibility", "Design Systems"} & skills:
        scores["frontend-engineering"] += 5
    if {"SQL", "Data Analysis", "Machine Learning"} & skills:
        scores["data-analytics"] += 4
    if {"Figma", "Design Systems", "Accessibility"} & skills:
        scores["product-design"] += 4
    if {"Product Strategy", "Project Management", "Communication"} & skills:
        scores["product-management"] += 4

    if scores["backend-engineering"] >= 4 and scores["frontend-engineering"] >= 4:
        return "full-stack-engineering"

    top_discipline = max(scores.items(), key=lambda item: item[1])[0]
    if scores[top_discipline] <= 1:
        return "general-technology"
    return top_discipline


#: Case-folded lookup from a SKILL_PATTERNS label to its patterns, so
#: `keyword_present` can match every synonym/family-member of a skill
#: (e.g. "SQL" -> PostgreSQL, MySQL, T-SQL, ...), not just the literal label.
_JOB_VOCABULARY: dict[str, tuple[str, ...]] = {**EXTRA_SKILL_PATTERNS, **SKILL_PATTERNS}
_SKILL_PATTERNS_BY_LOWER_LABEL = {label.lower(): patterns for label, patterns in _JOB_VOCABULARY.items()}


#: Evidence for a competency that is stated as an action, not by its name: "Led a team of 5"
#: shows leadership, "monitoring and alerting" shows observability. Used only to decide
#: whether a *resume* demonstrates a keyword; never to extract keywords from a posting.
_EVIDENCE_ALIASES: dict[str, tuple[str, ...]] = {
    "leadership": (
        # "Led a team of 5", "Led 5 engineers"; not "led to a 20% saving" or "led the migration".
        r"\bled (?:a |an |the |\d+ )?(?:[\w-]+ ){0,2}(?:teams?|groups?|squads?|engineers|developers|designers|analysts|people|reports)\b",
        r"\bleading (?:a |an |the |\d+ )",
        r"\bleads? (?:a |an |the )?(?:\w+ ){0,2}(?:team|group|squad|engineers|developers|designers|analysts)\b",
        r"\b(?:team|tech|technical) lead\b",
        r"\bmanag(?:ed|ing|es) (?:a |an |the )?(?:\w+ )?(?:team|group|squad|\d+)",
        r"\bhead of\b",
    ),
    "mentoring": (
        r"\bmentor(?:s|ed|ing|ship)?\b",
        r"\bcoach(?:ed|ing|es)?\b",
        r"\bmentee",
        r"\bonboard(?:ed|ing)? (?:new |junior )",
    ),
    "observability": (r"\bmonitoring\b", r"\balerting\b", r"\bopentelemetry\b", r"\bdistributed tracing\b"),
}

_MIN_STEMMABLE_LENGTH = 6


def _inflection_forms(word: str) -> set[str]:
    """The word and its *inflections* only ("deploy" -> deployed, "mentoring" -> mentored).

    Derivational endings (er, ion, ment, ship) are never added or stripped, and a
    "-ing" keyword never matches its bare stem, so "Marketing" is not shown by
    "stock market", "Server" by "served" or "Management" by "managed".
    """
    if len(word) < _MIN_STEMMABLE_LENGTH:
        return {word}
    forms = {word}
    if word.endswith("ing"):
        stem = word[:-3]
        forms |= {stem + tail for tail in ("ed", "es", "s", "e", "ing")}
    elif word.endswith("ed"):
        stem = word[:-2]
        forms |= {stem + tail for tail in ("ed", "es", "e", "ing")}
    elif word.endswith("s") and not word.endswith("ss"):
        forms.add(word[:-1])
        if word.endswith("es"):
            forms.add(word[:-2])
    else:
        forms |= {word + tail for tail in ("s", "es", "ed", "d", "ing")}
        if word.endswith("e"):
            forms.add(word[:-1] + "ing")
    return forms


def _inflection_pattern(word: str) -> str:
    forms = _inflection_forms(word)
    return r"\b(?:" + "|".join(sorted((re.escape(form) for form in forms), key=len, reverse=True)) + r")\b"


def keyword_present(keyword: str, text: str) -> bool:
    lowered = text.lower()
    normalized = keyword.lower().strip(".,:;!()[]{}")
    if normalized in {"api", "apis"}:
        return bool(re.search(r"\bapi(?:s)?\b", lowered))
    if any(re.search(pattern, lowered) for pattern in _EVIDENCE_ALIASES.get(normalized, ())):
        return True
    family_patterns = _SKILL_PATTERNS_BY_LOWER_LABEL.get(normalized)
    if family_patterns:
        return any(re.search(pattern, lowered) for pattern in family_patterns)
    if " " in normalized:
        return normalized in lowered
    return bool(re.search(_inflection_pattern(normalized), lowered))


def evidence_line(keyword: str, text: str, *, limit: int = 140) -> str | None:
    """The first resume line that demonstrates `keyword`, trimmed for display."""
    for raw in text.splitlines():
        line = raw.strip().lstrip("-*•0123456789.) ").strip()
        if line and keyword_present(keyword, line):
            return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"
    return None


_PREFERRED_CUE = re.compile(
    r"\b(?:nice[- ]to[- ]haves?|good to have|preferred|bonus|desirable|pluses|ideally|extra credit|not required)\b",
    re.IGNORECASE,
)
#: "Kubernetes is a plus", "Terraform and Helm are a bonus": the cue closes the clause it ends.
_TRAILING_CUE = re.compile(r"\b(?:is|are)\s+(?:a\s+|an\s+)?(?:big\s+|real\s+)?(?:plus|bonus)(?:es)?\b|\ba\s+plus\b", re.IGNORECASE)
_SENTENCE_BREAK = re.compile(r"(?<=[.;!?])\s+")
_CLAUSE_BREAK = re.compile(r"[,;]|\b(?:but|while)\b", re.IGNORECASE)
_PLURAL_CLAUSE_BREAK = re.compile(
    r";|\b(?:but|while)\b|\b(?:required|essential|mandatory|needed|a must)\s*,", re.IGNORECASE
)
_MUST_HEADING = re.compile(
    r"^\W*(?:requirements?|required|must[- ]haves?|minimum qualifications|qualifications|"
    r"what you(?:'ll| will)? (?:bring|need|do)|responsibilities|about (?:the )?role|about you)\b",
    re.IGNORECASE,
)


def _trailing_cue_scope(sentence: str, cue: re.Match[str]) -> int:
    """Where, in `sentence`, the clause that the trailing cue closes begins."""
    breaker = _PLURAL_CLAUSE_BREAK if cue.group(0).lower().startswith("are") else _CLAUSE_BREAK
    start = 0
    for match in breaker.finditer(sentence[: cue.start()]):
        start = match.end()
    return start


def preferred_job_keywords(job_description: str, keywords: list[str]) -> list[str]:
    """Keywords the posting names only as nice-to-have ("Nice to have: Kubernetes", "... is a plus").

    A keyword also named in a required line, or outside any nice-to-have section, stays a must.
    A leading cue ("Nice to have:") covers what follows it; a trailing cue ("is a plus")
    covers the clause it ends, so "Python is required, Kubernetes is a plus." splits correctly.
    """
    mentions: dict[str, list[bool]] = {keyword: [] for keyword in keywords}
    in_preferred_section = False
    for raw in job_description.splitlines():
        line = raw.strip()
        if not line:
            in_preferred_section = False
            continue
        if _PREFERRED_CUE.search(line) and len(line) <= 40 and line.endswith(":"):
            in_preferred_section = True
            continue
        if _MUST_HEADING.match(line):
            in_preferred_section = False
        line_preferred = in_preferred_section
        for sentence in _SENTENCE_BREAK.split(line):
            trailing = _TRAILING_CUE.search(sentence)
            leading = _PREFERRED_CUE.search(sentence)
            for keyword in keywords:
                if trailing:
                    scope = _trailing_cue_scope(sentence, trailing)
                    if keyword_present(keyword, sentence[:scope]):
                        mentions[keyword].append(line_preferred)
                    if keyword_present(keyword, sentence[scope : trailing.end()]):
                        mentions[keyword].append(True)
                    if keyword_present(keyword, sentence[trailing.end() :]):
                        mentions[keyword].append(line_preferred)
                elif leading and not line_preferred:
                    # "Requirements: Python. Nice to have: Kubernetes." splits at the cue.
                    if keyword_present(keyword, sentence[: leading.start()]):
                        mentions[keyword].append(False)
                    if keyword_present(keyword, sentence[leading.start() :]):
                        mentions[keyword].append(True)
                elif keyword_present(keyword, sentence):
                    mentions[keyword].append(line_preferred or bool(leading))
            if leading and not trailing:
                line_preferred = True
    return [keyword for keyword, flags in mentions.items() if flags and all(flags)]


def format_keyword(token: str) -> str:
    token = token.strip().strip(".,:;!()[]{}")
    upper_tokens = {"api", "apis", "sql", "aws", "gcp", "ci/cd", "ux", "ui"}
    if token.lower() in upper_tokens:
        return "APIs" if token.lower() in {"api", "apis"} else token.upper()
    # Preserve mixed-case tokens like "JavaScript", "TypeScript", "PostgreSQL",
    # "FastAPI" when the user already typed them correctly. token.title() would
    # otherwise lowercase the second hump ("JavaScript" -> "Javascript").
    if any(c.isupper() for c in token[1:]):
        return token
    return token.title()


def _looks_like_technology(token: str) -> bool:
    """A token that is plausibly a product/tool name even if not in the vocabulary.

    Plain lowercase or Capitalised words ("behind", "Billing", "Lead") are never
    accepted; only CamelCase ("SQLAlchemy"), digits/symbols ("Node.js", "C++")
    or names ending in ".js"/".net".
    """
    if any(c.isupper() for c in token[1:]) and any(c.islower() for c in token):
        return True
    lowered = token.lower()
    return lowered.endswith((".js", ".net")) or any(c in token for c in "+#")


def _ranked_vocabulary_hits(job_description: str) -> list[str]:
    lowered = job_description.lower()
    hits: list[tuple[int, int, str]] = []
    for label, patterns in _JOB_VOCABULARY.items():
        positions = [m.start() for p in patterns for m in re.finditer(p, lowered)]
        if positions:
            hits.append((-min(len(positions), 3), min(positions), label))
    labels = {label for _c, _p, label in hits}
    if "SQL" in labels and labels & SQL_FLAVOUR_LABELS and not re.search(r"\bsql\b", lowered):
        hits = [h for h in hits if h[2] != "SQL"]
    return [label for _c, _p, label in sorted(hits)]


def extract_job_keywords(
    job_description: str, limit: int = 10, *, include_plain_words: bool = False
) -> list[str]:
    """Real skills, tools and competencies named in a posting (heuristic, no LLM).

    Curated vocabulary hits ranked by mention count then position, then curated
    phrases, then technology-looking tokens (CamelCase, ``Node.js``) the
    vocabulary does not know. Generic verbs and nouns never qualify.
    """
    lowered = job_description.lower()
    keywords: list[str] = _ranked_vocabulary_hits(job_description)

    for phrase in COMMON_KEYWORD_PHRASES:
        if phrase in lowered:
            keywords.append(format_keyword(phrase))

    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+/#.-]{2,}", job_description)
    token_counts: dict[str, int] = {}
    original_token: dict[str, str] = {}
    for token in tokens:
        cleaned = token.strip(".,:;!()[]{}")
        key = cleaned.lower()
        if key in STOPWORDS or len(key) < 4 or not (include_plain_words or _looks_like_technology(cleaned)):
            continue
        token_counts[key] = token_counts.get(key, 0) + 1
        original_token.setdefault(key, cleaned)

    ranked = sorted(
        token_counts.items(),
        key=lambda item: (-item[1], item[0]),
    )
    for token, _count in ranked:
        keywords.append(format_keyword(original_token[token]))

    return ordered_unique(keywords)[:limit]


_ROLE_NOUNS = frozenset(
    {
        "engineer", "developer", "designer", "manager", "analyst", "lead", "specialist",
        "architect", "scientist", "consultant", "director", "administrator", "coordinator",
        "officer", "recruiter", "researcher", "writer", "accountant", "technician",
        "programmer", "strategist", "producer",
    }
)  # fmt: skip
_ROLE_STOP_WORDS = frozenset(
    {
        "a", "an", "the", "for", "as", "we", "we're", "are", "is", "hiring", "seeking",
        "looking", "join", "our", "your", "to", "at", "with", "in", "on", "this", "that",
        "you", "will", "be", "from", "by", "about", "role", "position", "job", "title",
        "opening", "new", "and", "or", "of", "experienced", "talented", "passionate",
        "great", "exciting", "want", "need", "needs", "who", "us",
    }
)  # fmt: skip
_ROLE_LEVEL_SUFFIXES = frozenset({"i", "ii", "iii", "iv", "v"})
_ROLE_TITLE_PREFIX = re.compile(
    r"^\s*(?:job\s+title|title|position|role|vacancy|opening)\s*[:\-]\s*", re.IGNORECASE
)
_ROLE_MAX_WORDS = 5
_ROLE_SCAN_LINES = 40


def _clean_role_token(token: str) -> str:
    return token.strip("#*_`>()[]{}|.,:;!?\"'")


def _role_title_from_line(line: str) -> str | None:
    """The first job-title phrase in `line`, or None."""
    tokens = line.split()
    has_upper = any(ch.isupper() for ch in line)
    for index, token in enumerate(tokens):
        if _clean_role_token(token).lower() not in _ROLE_NOUNS:
            continue
        words = [_clean_role_token(token)]
        cursor = index - 1
        while cursor >= 0 and len(words) < _ROLE_MAX_WORDS:
            previous = tokens[cursor]
            word = _clean_role_token(previous)
            # Sentence/field boundaries end the title ("Job Title: ...", "Acme, ...").
            if not word or previous[-1] in ":,;|.!?)" or word.lower() in _ROLE_STOP_WORDS:
                break
            if has_upper and not (word[0].isupper() or word[0].isdigit()):
                break
            words.insert(0, word)
            cursor -= 1
        following = _clean_role_token(tokens[index + 1]) if index + 1 < len(tokens) else ""
        if following.lower() in _ROLE_LEVEL_SUFFIXES and (following.isupper() or not has_upper):
            words.append(following)
        if len(words) < 2 and len(line) > 40:
            # A lone "lead"/"manager" inside a sentence is not a title.
            continue
        title = " ".join(words)
        if title.islower():
            title = title.title()
        return title[:60].strip()
    return None


def extract_role_label(job_description: str) -> str | None:
    """A clean job title from the posting, without an LLM.

    Pass 1 looks for an explicit "Job title: ..." field, pass 2 for a short
    heading-like line, pass 3 for a title inside a longer sentence. The result
    is only the title phrase ("Senior Backend Engineer"), never the whole line.
    """
    raw_lines = [line.strip() for line in job_description.splitlines() if line.strip()]
    raw_lines = raw_lines[:_ROLE_SCAN_LINES]
    fields = [_ROLE_TITLE_PREFIX.sub("", line) for line in raw_lines if _ROLE_TITLE_PREFIX.match(line)]
    headings = [line for line in raw_lines if len(line) <= 90]
    for candidates in (fields, headings, raw_lines):
        for line in candidates:
            title = _role_title_from_line(line)
            if title:
                return title
    return None


def build_resume_prepass(resume_text: str, job_description: str | None) -> ResumePrepass:
    detected_sections = detect_sections(resume_text)
    detected_skills = extract_detected_skills(resume_text)
    job_keywords = extract_job_keywords(job_description or "")
    matched_keywords = [kw for kw in job_keywords if keyword_present(kw, resume_text)]
    missing_keywords = [kw for kw in job_keywords if kw not in matched_keywords]
    return ResumePrepass(
        detected_sections=detected_sections,
        detected_skills=detected_skills,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        quantified_bullets=count_quantified_bullets(resume_text),
        word_count=len(re.findall(r"\w+", resume_text)),
        bullet_lines=count_bullet_lines(resume_text),
        action_verb_hits=count_action_verbs(resume_text),
        job_keywords=job_keywords,
        target_role_label=extract_role_label(job_description or ""),
        preferred_keywords=preferred_job_keywords(job_description or "", job_keywords),
    )


def compute_resume_breakdown(prepass: ResumePrepass) -> list[dict[str, int | str]]:
    if prepass.job_keywords:
        keyword_ratio = len(prepass.matched_keywords) / max(len(prepass.job_keywords), 1)
        keywords_score = clamp(round(30 + (keyword_ratio * 70)))
    else:
        keywords_score = clamp(36 + (len(prepass.detected_skills) * 7))

    impact_score = clamp(
        24 + (prepass.quantified_bullets * 16) + (min(prepass.action_verb_hits, 6) * 4)
    )
    structure_score = clamp(
        25 + (len(prepass.detected_sections) * 12) + (min(prepass.bullet_lines, 8) * 4)
    )
    clarity_score = clamp(
        38
        + (len(prepass.detected_sections) * 8)
        + (10 if 140 <= prepass.word_count <= 500 else 0)
        + (8 if prepass.bullet_lines >= 4 else 0)
    )
    completeness_score = clamp(
        20
        + (len(prepass.detected_sections) * 13)
        + (12 if prepass.word_count >= 180 else 0)
        + (8 if len(prepass.detected_skills) >= 5 else 0)
    )

    return [
        {"key": "keywords", "label": "Keyword alignment", "score": keywords_score},
        {"key": "impact", "label": "Impact evidence", "score": impact_score},
        {"key": "structure", "label": "Structure", "score": structure_score},
        {"key": "clarity", "label": "Clarity", "score": clarity_score},
        {"key": "completeness", "label": "Completeness", "score": completeness_score},
    ]


def compute_overall_score(score_breakdown: list[dict[str, int | str]]) -> int:
    scores = [int(item["score"]) for item in score_breakdown]
    return round(sum(scores) / max(len(scores), 1))


#: Resume Analyzer severity bands. A dimension scoring below
#: :data:`SEVERITY_HIGH_BELOW` is "high" severity, below
#: :data:`SEVERITY_MEDIUM_BELOW` is "medium", otherwise "low".
SEVERITY_HIGH_BELOW = 55
SEVERITY_MEDIUM_BELOW = 72


def severity_from_score(score: int) -> str:
    """Return the Resume Analyzer severity band for a category subscore (0..100).

    The band that turns a numeric dimension score into the issue severity the
    result page renders. It lives here, beside :func:`job_match_verdict` (the
    Job Match equivalent), as the single source of truth production applies.
    """
    if score < SEVERITY_HIGH_BELOW:
        return "high"
    if score < SEVERITY_MEDIUM_BELOW:
        return "medium"
    return "low"


#: A missing nice-to-have counts for half a missing must in the match score.
PREFERRED_WEIGHT = 0.5


def compute_match_score(
    matched_keywords: list[str],
    missing_keywords: list[str],
    preferred_keywords: list[str] | None = None,
) -> int:
    preferred = {keyword.lower() for keyword in preferred_keywords or []}

    def weight(keyword: str) -> float:
        return PREFERRED_WEIGHT if keyword.lower() in preferred else 1.0

    total = sum(weight(k) for k in matched_keywords) + sum(weight(k) for k in missing_keywords)
    if total == 0:
        return 58
    ratio = sum(weight(k) for k in matched_keywords) / total
    return clamp(round(25 + (ratio * 75)))


def job_match_verdict(match_score: int) -> str:
    if match_score >= 78:
        return "strong"
    if match_score >= 55:
        return "borderline"
    return "stretch"


# --- Blended Scoring (heuristic 40% + LLM 60%) ---

HEURISTIC_WEIGHT = 0.4
LLM_WEIGHT = 0.6
CONFIDENCE_GAP_THRESHOLD = 20

BREAKDOWN_KEYS = ("keywords", "impact", "structure", "clarity", "completeness")


def compute_blended_score(
    heuristic_breakdown: list[dict[str, int | str]],
    llm_breakdown: list[dict] | None,
) -> list[dict[str, int | str]]:
    """Blend heuristic and LLM score breakdowns (40/60 weighted average).

    If llm_breakdown is None or empty, returns heuristic scores unchanged.
    """
    if not llm_breakdown:
        return heuristic_breakdown

    llm_by_key = {}
    for item in llm_breakdown:
        key = item.get("key")
        score = item.get("score")
        if key and isinstance(score, (int, float)):
            llm_by_key[str(key)] = int(score)

    if not llm_by_key:
        return heuristic_breakdown

    blended = []
    for item in heuristic_breakdown:
        key = str(item["key"])
        h_score = int(item["score"])
        l_score = llm_by_key.get(key)

        if l_score is not None:
            final = clamp(round(h_score * HEURISTIC_WEIGHT + l_score * LLM_WEIGHT))
        else:
            final = h_score

        blended.append({**item, "score": final})
    return blended


def confidence_gap_note(
    heuristic_overall: int,
    llm_overall: int | None,
) -> str | None:
    """Return a confidence note if heuristic and LLM scores diverge significantly."""
    if llm_overall is None:
        return None
    gap = abs(heuristic_overall - llm_overall)
    if gap > CONFIDENCE_GAP_THRESHOLD:
        return (
            f"Heuristic and AI assessments differ by {gap} points — "
            "interpret this score as approximate."
        )
    return None


# --- Sector Detection ---

SECTOR_KEYWORDS: dict[str, tuple[str, ...]] = {
    "fintech": ("fintech", "financial", "banking", "payments", "trading", "insurance"),
    "healthtech": ("health", "medical", "clinical", "patient", "healthcare", "pharma"),
    "e-commerce": ("e-commerce", "ecommerce", "marketplace", "retail", "shopping", "commerce"),
    "saas": ("saas", "b2b", "subscription", "platform"),
    "edtech": ("edtech", "education", "learning", "students", "curriculum"),
    "gaming": ("gaming", "game", "esports", "interactive entertainment"),
    "cybersecurity": ("security", "cybersecurity", "infosec", "threat", "vulnerability"),
    "ai-ml": ("artificial intelligence", "machine learning", "deep learning", "nlp", "llm"),
}


def detect_sector(job_description: str) -> str | None:
    """Auto-detect industry sector from job description keywords."""
    if not job_description:
        return None
    lowered = job_description.lower()
    scores: dict[str, int] = {}
    for sector, keywords in SECTOR_KEYWORDS.items():
        scores[sector] = sum(1 for kw in keywords if kw in lowered)
    top = max(scores.items(), key=lambda x: x[1])
    return top[0] if top[1] >= 2 else None


# --- Career Profile Inference ---

def infer_career_profile(resume_text: str) -> dict:
    """Bundle seniority, discipline, and years into a career profile dict."""
    detected_skills = extract_detected_skills(resume_text)
    return {
        "seniority": infer_resume_seniority(resume_text),
        "seniority_label": seniority_label(infer_resume_seniority(resume_text)),
        "discipline": infer_resume_discipline(resume_text, detected_skills),
        "discipline_label": discipline_label(infer_resume_discipline(resume_text, detected_skills)),
        "years_experience": infer_resume_years_experience(resume_text),
        "detected_skills": detected_skills,
    }


# --- Headline / verdict agreement ---

_NEGATORS = re.compile(r"\b(?:not|n't|no longer|never|isn't|doesn't|without)\b[^.;]{0,25}$", re.IGNORECASE)
_POSITIVE_HEADLINE = re.compile(
    r"\baligns?\b|\baligned\b|\bstrong (?:foundation|match|fit|resume|candidate)\b|"
    r"\bwell[- ](?:aligned|matched|positioned)\b|\bexcellent\b|\bready to (?:send|apply|submit)\b|"
    r"\bcompetitive\b|\bcompelling\b|\bgreat fit\b|\bsolid match\b",
    re.IGNORECASE,
)
_STRONG_POSITIVE_HEADLINE = re.compile(
    r"\bstrong (?:foundation|match|fit|resume|candidate)\b|\bexcellent\b|"
    r"\bready to (?:send|apply|submit)\b|\bgreat fit\b|\baligns well\b|\bwell[- ]aligned\b",
    re.IGNORECASE,
)
_NEGATIVE_HEADLINE = re.compile(
    r"\bstretch\b|\bweak (?:match|fit|resume|candidate)\b|\bpoor fit\b|\bsignificant gaps?\b|\bfar from\b|\bunlikely\b", re.IGNORECASE
)


def _claims(pattern: re.Pattern[str], headline: str) -> bool:
    """True when `headline` asserts `pattern` (a negation right before it cancels the claim)."""
    return any(not _NEGATORS.search(headline[: m.start()]) for m in pattern.finditer(headline))


def headline_conflicts_with_band(headline: str, band: str) -> bool:
    """Whether a provider's headline says the opposite of the locked score band.

    `band` is "high" (strong), "mid" (borderline) or "low" (stretch / needs work). The
    score and verdict are computed, so a headline that cheers for a low score, or warns
    of a stretch for a high one, is replaced by the computed headline.
    """
    if band == "low":
        return _claims(_POSITIVE_HEADLINE, headline)
    if band == "mid":
        return _claims(_STRONG_POSITIVE_HEADLINE, headline) or _claims(_NEGATIVE_HEADLINE, headline)
    if band == "high":
        return _claims(_NEGATIVE_HEADLINE, headline)
    return False
