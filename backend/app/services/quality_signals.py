from __future__ import annotations

import re
from dataclasses import dataclass

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
    "SQL": (r"\bsql\b", r"\bpostgresql\b", r"\bmysql\b", r"\bsqlite\b"),
    "FastAPI": (r"\bfastapi\b",),
    "APIs": (r"\bapi\b", r"\bapis\b", r"\brest\b", r"\bgraphql\b"),
    "JavaScript": (r"\bjavascript\b",),
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


def keyword_present(keyword: str, text: str) -> bool:
    lowered = text.lower()
    normalized = keyword.lower().strip(".,:;!()[]{}")
    if normalized in {"api", "apis"}:
        return bool(re.search(r"\bapi(?:s)?\b", lowered))
    if " " in normalized:
        return normalized in lowered
    return bool(re.search(rf"\b{re.escape(normalized)}\b", lowered))


def format_keyword(token: str) -> str:
    token = token.strip().strip(".,:;!()[]{}")
    upper_tokens = {"api", "apis", "sql", "aws", "gcp", "ci/cd", "ux", "ui"}
    if token.lower() in upper_tokens:
        return "APIs" if token.lower() in {"api", "apis"} else token.upper()
    return token.title()


def extract_job_keywords(job_description: str, limit: int = 10) -> list[str]:
    lowered = job_description.lower()
    keywords: list[str] = extract_detected_skills(job_description)

    for phrase in COMMON_KEYWORD_PHRASES:
        if phrase in lowered:
            keywords.append(format_keyword(phrase))

    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+/#.-]{2,}", job_description)
    token_counts: dict[str, int] = {}
    original_token: dict[str, str] = {}
    for token in tokens:
        cleaned = token.strip(".,:;!()[]{}")
        key = cleaned.lower()
        if key in STOPWORDS or len(key) < 4:
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


def extract_role_label(job_description: str) -> str | None:
    for line in job_description.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        if len(cleaned) <= 90 and re.search(
            r"\b(engineer|developer|designer|manager|analyst|lead|specialist)\b",
            cleaned.lower(),
        ):
            return cleaned
    match = re.search(
        r"\b([A-Z][A-Za-z/&+\- ]+(?:Engineer|Developer|Designer|Manager|Analyst|Lead|Specialist))\b",
        job_description,
    )
    return match.group(1).strip() if match else None


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


def compute_match_score(matched_keywords: list[str], missing_keywords: list[str]) -> int:
    total = len(matched_keywords) + len(missing_keywords)
    if total == 0:
        return 58
    ratio = len(matched_keywords) / total
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
