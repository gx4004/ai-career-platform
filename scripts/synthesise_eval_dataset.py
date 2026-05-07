"""Synthesise the comparative-study evaluation dataset for Chapter 4.3.

Produces ``thesis/eval-dataset.json`` deterministically — same seed, identical
output — so the evaluation manifest is reproducible and defensible at viva.
The dataset has the shape the eval harness expects::

    [{"id": "r-backend-02__jd-backend-01", "resume": "...", "jd": "...",
      "role_track": "backend"}, ...]

Design (aligned with the ESCO subset bundled at backend/app/data/esco_skills.json):

* 6 role tracks: backend, frontend, fullstack, data, design, pm.
* 5 synthetic resumes per track (30 total) varying in seniority and skill
  density. Each resume is well above the 140-word v2 thin-resume threshold.
* 3-4 synthetic job descriptions per track (20 total).
* In-track pairing: every resume × every JD inside its own track. With the
  3/3/3/3/4/4 JD distribution this yields exactly 100 pairs.

The synthesis is template-based and stdlib-only. It does NOT use an LLM,
which keeps the dataset reproducible from the script alone and avoids the
"the dataset is itself LLM-generated" criticism in defence.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "thesis" / "eval-dataset.json"

SEED = 42


# ---------------------------------------------------------------------------
# Track definitions — every skill list is taken from ESCO bundle canonicals
# (backend/app/data/esco_skills.json) so that ESCO normalisation can find them.
# ---------------------------------------------------------------------------

TRACKS: dict[str, dict] = {
    "backend": {
        "track_label": "Backend Engineer",
        "core_skills": [
            "Python", "FastAPI", "PostgreSQL", "REST APIs", "Docker",
            "Redis", "SQL", "Git", "Unit testing",
        ],
        "secondary_skills": [
            "Kubernetes", "AWS", "Microservices", "GraphQL",
            "OAuth", "JWT", "Observability", "Performance optimization",
            "GitHub Actions", "Linux",
        ],
        "responsibilities": [
            "designed and shipped REST APIs serving production traffic",
            "owned the database schema and migration strategy in PostgreSQL",
            "migrated a monolithic service into smaller, independently deployable microservices",
            "introduced structured logging and tracing across the request path",
            "tightened authentication using OAuth2 and refresh-token rotation",
            "rewrote the slowest endpoints to use background queues and caching",
            "built the integration-test harness that gates every pull request",
            "ran the on-call rotation for the payments backend",
        ],
        "achievements": [
            "reduced p95 latency by 38% on the highest-traffic endpoint",
            "eliminated 41% of recurring cloud spend by right-sizing background workers",
            "shipped a backwards-compatible v2 API with zero downtime",
            "cut median CI runtime from 22 to 8 minutes",
            "drove the post-incident review that closed a long-running data-loss class of bugs",
        ],
        "companies": ["a fintech startup", "a logistics SaaS", "an e-commerce platform", "an internal-tools team"],
        "majors": ["Computer Science", "Software Engineering", "Computer Engineering"],
        "role_titles_resume": ["Backend Engineer", "Software Engineer", "Senior Backend Engineer"],
        "jd_titles": [
            ("Backend Engineer", "junior"),
            ("Senior Backend Engineer", "senior"),
            ("Backend Engineer (Python/FastAPI)", "mid"),
        ],
    },
    "frontend": {
        "track_label": "Frontend Engineer",
        "core_skills": [
            "React", "TypeScript", "JavaScript", "CSS", "HTML",
            "Vite", "Tailwind CSS", "Git", "Unit testing",
        ],
        "secondary_skills": [
            "Next.js", "Webpack", "GraphQL", "Accessibility",
            "Design systems", "Integration testing",
            "Performance optimization", "Figma",
        ],
        "responsibilities": [
            "built reusable component libraries with strict TypeScript types",
            "owned the design-system tokens and migrated three product surfaces to them",
            "wrote end-to-end tests covering the critical user flows",
            "improved Lighthouse performance scores on the marketing pages",
            "led the migration from a legacy Webpack pipeline to Vite",
            "shipped accessibility fixes that brought WCAG compliance to AA",
            "introduced Storybook-driven component review across the team",
        ],
        "achievements": [
            "cut First Contentful Paint by 1.4s on the dashboard route",
            "removed 220kB of unused JavaScript from the main bundle",
            "lifted A/B-test win rate by 18% by rebuilding the upgrade modal",
            "shipped a typed forms abstraction now used across four product teams",
        ],
        "companies": ["a B2B SaaS startup", "a media platform", "an analytics product", "a healthcare web app"],
        "majors": ["Computer Science", "Information Systems", "Human-Computer Interaction"],
        "role_titles_resume": ["Frontend Engineer", "UI Engineer", "Senior Frontend Engineer"],
        "jd_titles": [
            ("Frontend Engineer", "junior"),
            ("Senior Frontend Engineer (React)", "senior"),
            ("Frontend Engineer (Design Systems)", "mid"),
        ],
    },
    "fullstack": {
        "track_label": "Full-Stack Engineer",
        "core_skills": [
            "Node.js", "Express.js", "React", "TypeScript", "PostgreSQL",
            "REST APIs", "Docker", "Git", "Unit testing",
        ],
        "secondary_skills": [
            "Next.js", "GraphQL", "AWS", "Redis", "Microservices",
            "Integration testing", "GitHub Actions",
        ],
        "responsibilities": [
            "owned a product feature end-to-end from API design to UI implementation",
            "shipped the realtime collaboration backend on top of WebSocket fan-out",
            "rewrote the legacy Express.js API into a typed Node.js service",
            "built the developer-tooling harness that lets engineers spin up a full local stack",
            "introduced a typed contract between the React client and the Node API",
            "drove the migration from REST to GraphQL for the customer-facing app",
        ],
        "achievements": [
            "delivered the team's first product launch in under 12 weeks",
            "reduced API-to-UI integration bugs by approximately half",
            "shipped a typed end-to-end stack now used by every new product surface",
        ],
        "companies": ["an early-stage startup", "an internal platform team", "a creative-tools company"],
        "majors": ["Computer Science", "Software Engineering"],
        "role_titles_resume": ["Full-Stack Engineer", "Software Engineer", "Senior Full-Stack Engineer"],
        "jd_titles": [
            ("Full-Stack Engineer", "junior"),
            ("Senior Full-Stack Engineer", "senior"),
            ("Full-Stack Engineer (Node + React)", "mid"),
            ("Full-Stack Engineer (Product)", "mid"),
        ],
    },
    "data": {
        "track_label": "Data Analyst / Data Engineer",
        "core_skills": [
            "SQL", "Python", "Pandas", "NumPy", "Statistics",
            "Data visualization", "Excel", "Git",
        ],
        "secondary_skills": [
            "Apache Airflow", "Apache Spark", "ETL", "Data warehousing",
            "Tableau", "Power BI", "Google Cloud Platform",
        ],
        "responsibilities": [
            "built the daily revenue dashboard powering the executive review",
            "designed and ran ETL jobs in Apache Airflow that landed daily into the warehouse",
            "owned the customer-segmentation pipeline used by marketing",
            "ran exploratory analyses on retention, churn, and feature uptake",
            "translated ambiguous product questions into measurable hypotheses",
            "cleaned and modelled the warehouse layer that became the source of truth",
        ],
        "achievements": [
            "halved the time the marketing team needed to receive weekly KPIs",
            "exposed a data-quality regression that had distorted retention reporting for two quarters",
            "shipped the first cohort-analysis dashboard the leadership team relies on",
            "identified the segment that produced 42% of incremental revenue",
        ],
        "companies": ["a consumer subscription product", "a B2B SaaS company", "a logistics platform"],
        "majors": ["Statistics", "Applied Mathematics", "Computer Science", "Economics"],
        "role_titles_resume": ["Data Analyst", "Data Engineer", "Senior Data Analyst"],
        "jd_titles": [
            ("Data Analyst", "junior"),
            ("Senior Data Analyst", "senior"),
            ("Data Engineer (ETL)", "mid"),
        ],
    },
    "design": {
        "track_label": "Product Designer",
        "core_skills": [
            "Figma", "User experience design", "User interface design",
            "Wireframing", "Prototyping", "Design systems", "Accessibility",
        ],
        "secondary_skills": [
            "Adobe XD", "Adobe Photoshop", "Adobe Illustrator",
            "Customer research", "User research",
            "Cross-functional collaboration",
        ],
        "responsibilities": [
            "owned the end-to-end design of the onboarding flow",
            "built and maintained the product's design-system library in Figma",
            "ran weekly user interviews and translated findings into product changes",
            "produced high-fidelity prototypes that engineering shipped without rework",
            "led the accessibility audit and the WCAG-AA remediation plan",
            "facilitated the cross-functional design reviews with engineering and PM",
        ],
        "achievements": [
            "tripled adoption of the upgraded settings UI within four weeks of launch",
            "shipped a redesign that reduced support-ticket volume on billing by 31%",
            "consolidated three legacy component libraries into a single design system",
        ],
        "companies": ["a creative-tools SaaS", "a healthcare platform", "a fintech consumer app"],
        "majors": ["Interaction Design", "Visual Communication Design", "Human-Computer Interaction"],
        "role_titles_resume": ["Product Designer", "UX Designer", "Senior Product Designer"],
        "jd_titles": [
            ("Product Designer", "junior"),
            ("Senior Product Designer", "senior"),
            ("Product Designer (Design Systems)", "mid"),
            ("UX Designer", "mid"),
        ],
    },
    "pm": {
        "track_label": "Product Manager",
        "core_skills": [
            "Product management", "Roadmapping", "Stakeholder management",
            "Cross-functional collaboration", "Customer research",
            "A/B testing", "OKRs",
        ],
        "secondary_skills": [
            "Project management", "Jira", "Confluence",
            "Agile methodology", "Public speaking", "Technical writing",
            "Statistics",
        ],
        "responsibilities": [
            "owned the roadmap for a product surface used by tens of thousands of users",
            "ran weekly customer-research conversations and synthesised them into product bets",
            "designed and shipped the experimentation framework the team now uses by default",
            "wrote the quarterly OKRs and led the cross-functional planning rituals",
            "led the discovery work that resulted in the team's largest launch of the year",
            "negotiated scope across engineering, design, and go-to-market",
        ],
        "achievements": [
            "shipped a feature that lifted activation by 22% within one quarter",
            "killed a half-built initiative after research showed weak demand, freeing two engineers",
            "led the launch that opened the company's second monetisation surface",
        ],
        "companies": ["a B2B SaaS scale-up", "a developer-tools company", "a consumer marketplace"],
        "majors": ["Industrial Engineering", "Business Administration", "Computer Science"],
        "role_titles_resume": ["Product Manager", "Associate Product Manager", "Senior Product Manager"],
        "jd_titles": [
            ("Product Manager", "junior"),
            ("Senior Product Manager", "senior"),
            ("Product Manager (Growth)", "mid"),
        ],
    },
}


# ---------------------------------------------------------------------------
# Synthetic surface details (all fictional)
# ---------------------------------------------------------------------------

NAMES = [
    "Alex Brown", "Mira Patel", "Jordan Lee", "Sami Okafor", "Priya Singh",
    "Daniel Kovacs", "Elena Sokolova", "Tomasz Nowak", "Hana Yamamoto",
    "Marco Rossi", "Aisha Rahman", "Lucas Silva", "Niamh O'Connor",
    "Karim Haddad", "Chen Wei", "Olivia Andersen", "Mateusz Wójcik",
    "Yuki Tanaka", "Ines Ferreira", "David Cohen", "Aanya Sharma",
    "Pavel Dvořák", "Sara Lindgren", "Joaquin Reyes", "Ngozi Okeke",
    "Han Solberg", "Ravi Mehta", "Léa Dupont", "Adrian Walczak", "Sina Ahmadi",
]

CITIES = [
    "Wrocław, Poland", "Berlin, Germany", "Amsterdam, Netherlands",
    "Lisbon, Portugal", "Stockholm, Sweden", "Madrid, Spain",
    "London, United Kingdom", "Dublin, Ireland",
]

UNIVERSITIES = [
    "Wrocław University of Science and Technology",
    "TU Delft", "ETH Zürich", "KTH Royal Institute of Technology",
    "Politecnico di Milano", "TU Berlin", "Trinity College Dublin",
    "Charles University, Prague",
]

SUMMARIES = [
    "Engineer with {years} years of professional experience focused on {focus}.",
    "{years}-year practitioner with a track record of {focus}.",
    "Pragmatic builder focused on {focus} for the past {years} years.",
    "Hands-on contributor with {years} years of experience in {focus}.",
]

SUMMARY_FOLLOWUPS = [
    "Comfortable working across the full delivery cycle, from discovery to production rollout.",
    "Known for shipping reliably and writing maintainable, well-tested code.",
    "Bias toward measurable impact over surface output and toward calm, well-instrumented systems.",
    "Strong collaborator across engineering, product, and design.",
    "Track record of leaving systems in a better state than I found them.",
]

PROJECT_PHRASES = [
    "Open-source contributor to several libraries in the {focus} space; merged improvements to documentation, performance, and test coverage.",
    "Side project: a small {focus}-themed tool used by a few hundred weekly active users; written end-to-end and self-deployed.",
    "Volunteer technical work with a non-profit, including a redesign of their internal {focus} workflow.",
    "Personal study project rebuilding a familiar {focus} system from scratch to internalise the trade-offs.",
]

COMPANY_NAMES = [
    "Northwind", "Helix Labs", "Brightline", "Carta Stack",
    "Loop Studios", "Vector Health", "Rune", "Slate Analytics",
    "Tideflow", "Anchor Cloud",
]


def years_for_seniority(seniority: int) -> int:
    """Map index 0..4 to a plausible years-of-experience value."""
    return [1, 2, 4, 6, 9][seniority]


def seniority_label(seniority: int) -> str:
    return ["junior", "junior", "mid", "senior", "senior"][seniority]


# ---------------------------------------------------------------------------
# Resume generation
# ---------------------------------------------------------------------------

def make_resume(track_id: str, idx: int, name: str, rng: random.Random) -> str:
    """Compose a synthetic resume of ~250-400 words for `track_id` at seniority `idx`.

    The resume includes Summary, Skills, Experience (2-3 jobs), and Education
    sections — all of which the v2 section detector recognises.
    """
    track = TRACKS[track_id]
    yrs = years_for_seniority(idx)
    sen = seniority_label(idx)

    # Skills: lower index → fewer skills (juniors); higher index → wider stack.
    n_core = [4, 5, 6, 7, 8][idx]
    n_secondary = [1, 2, 3, 4, 5][idx]
    core = rng.sample(track["core_skills"], min(n_core, len(track["core_skills"])))
    secondary = rng.sample(track["secondary_skills"], min(n_secondary, len(track["secondary_skills"])))
    skills = core + secondary

    # Summary — two sentences so juniors clear the v2 thin-resume threshold.
    focus_words = ", ".join(rng.sample(core, min(3, len(core))))
    summary = (
        rng.choice(SUMMARIES).format(years=yrs, focus=focus_words)
        + " "
        + rng.choice(SUMMARY_FOLLOWUPS)
    )
    project_focus = rng.choice(core)
    project_lines = rng.sample(PROJECT_PHRASES, k=2)
    projects = [line.format(focus=project_focus) for line in project_lines]

    # Experience: 2 jobs for junior, 3 for mid+
    n_jobs = 2 if idx < 2 else 3
    jobs: list[tuple[str, str, str, list[str]]] = []
    job_titles_pool = track["role_titles_resume"]
    starting_year = 2026 - yrs
    cursor_year = 2026
    for j in range(n_jobs):
        job_yrs = max(1, yrs // n_jobs + (1 if j == 0 else 0))
        end = cursor_year
        start = max(starting_year, end - job_yrs)
        title = rng.choice(job_titles_pool)
        if j > 0:
            # Earlier role: prefer a less-senior title from the same pool.
            title = job_titles_pool[0] if len(job_titles_pool) > 1 else title
        company = f"{rng.choice(COMPANY_NAMES)} ({rng.choice(track['companies'])})"
        # Every job gets 3 responsibilities and 1 achievement bullet so even
        # juniors clear the 140-word v2 thin-resume floor.
        bullets = rng.sample(track["responsibilities"], k=min(3, len(track["responsibilities"])))
        bullets.append(rng.choice(track["achievements"]))
        jobs.append((title, company, f"{start} – {end}", bullets))
        cursor_year = start

    # Education
    major = rng.choice(track["majors"])
    university = rng.choice(UNIVERSITIES)
    grad_year = max(2010, starting_year - 1)

    # Render
    parts: list[str] = []
    parts.append(f"{name}")
    parts.append(f"{rng.choice(CITIES)}\n")
    parts.append("Summary")
    parts.append(summary)
    parts.append("")
    parts.append("Skills")
    parts.append(", ".join(skills))
    parts.append("")
    parts.append("Experience")
    for title, company, span, bullets in jobs:
        parts.append(f"{title} — {company} ({span})")
        for b in bullets:
            parts.append(f"- {b}")
        parts.append("")
    parts.append("Projects")
    for line in projects:
        parts.append(f"- {line}")
    parts.append("")
    parts.append("Education")
    parts.append(f"{major}, {university} ({grad_year})")

    text = "\n".join(parts).strip() + "\n"
    return text


# ---------------------------------------------------------------------------
# Job-description generation
# ---------------------------------------------------------------------------

JD_INTROS = [
    "We are {company_descriptor} hiring a {title}.",
    "Our team is looking for a {title} to join {company_descriptor}.",
    "{title} role at {company_descriptor}.",
]

JD_RESPONSIBILITIES_HEADER = ["Responsibilities", "What you'll do", "About the role"]
JD_REQUIREMENTS_HEADER = ["Requirements", "What we're looking for", "You bring"]
JD_NICE_HEADER = ["Nice to have", "Bonus points", "It's a plus if"]


def make_jd(track_id: str, idx: int, rng: random.Random) -> str:
    """Compose a synthetic job description of ~180-260 words for `track_id`."""
    track = TRACKS[track_id]
    title, level = track["jd_titles"][idx]
    company_descriptor = rng.choice(track["companies"])
    intro = rng.choice(JD_INTROS).format(title=title, company_descriptor=company_descriptor)

    # Responsibilities — 4 bullets sampled from the track pool.
    resps = rng.sample(track["responsibilities"], k=min(4, len(track["responsibilities"])))

    # Requirements — depend on level. Senior asks for more.
    n_req_core = {"junior": 4, "mid": 5, "senior": 6}[level]
    n_req_secondary = {"junior": 1, "mid": 2, "senior": 3}[level]
    yrs_required = {"junior": "1+ years", "mid": "3+ years", "senior": "5+ years"}[level]
    must_core = rng.sample(track["core_skills"], min(n_req_core, len(track["core_skills"])))
    must_sec = rng.sample(track["secondary_skills"], min(n_req_secondary, len(track["secondary_skills"])))
    musts = must_core + must_sec

    # Nice to have — 2-3 secondary skills not already in must list.
    nice_pool = [s for s in track["secondary_skills"] if s not in must_sec]
    nice = rng.sample(nice_pool, k=min(3, len(nice_pool)))

    parts: list[str] = []
    parts.append(intro)
    parts.append("")
    parts.append(rng.choice(JD_RESPONSIBILITIES_HEADER))
    for r in resps:
        parts.append(f"- {r}")
    parts.append("")
    parts.append(rng.choice(JD_REQUIREMENTS_HEADER))
    parts.append(f"- {yrs_required} of professional experience as a {track['track_label']} or comparable role")
    for s in musts:
        parts.append(f"- Hands-on experience with {s}")
    parts.append("")
    parts.append(rng.choice(JD_NICE_HEADER))
    for s in nice:
        parts.append(f"- {s}")
    parts.append("")
    parts.append(
        "We support remote work in the EU and hybrid arrangements from our offices in "
        f"{rng.choice(CITIES)}."
    )
    return "\n".join(parts).strip() + "\n"


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def build_manifest() -> list[dict]:
    rng = random.Random(SEED)
    name_pool = list(NAMES)
    rng.shuffle(name_pool)

    pairs: list[dict] = []
    name_idx = 0
    track_ids = list(TRACKS.keys())
    for track_id in track_ids:
        # 5 resumes per track
        track_resumes: list[tuple[str, str]] = []
        for r_idx in range(5):
            name = name_pool[name_idx]
            name_idx += 1
            resume_text = make_resume(track_id, r_idx, name, rng)
            track_resumes.append((f"r-{track_id}-{r_idx + 1:02d}", resume_text))

        # 3-4 JDs per track (driven by len(jd_titles))
        track_jds: list[tuple[str, str]] = []
        for j_idx in range(len(TRACKS[track_id]["jd_titles"])):
            jd_text = make_jd(track_id, j_idx, rng)
            track_jds.append((f"jd-{track_id}-{j_idx + 1:02d}", jd_text))

        # In-track pairing: every resume × every JD.
        for r_id, r_text in track_resumes:
            for j_id, j_text in track_jds:
                pairs.append({
                    "id": f"{r_id}__{j_id}",
                    "resume": r_text,
                    "jd": j_text,
                    "role_track": track_id,
                })

    return pairs


def main() -> int:
    manifest = build_manifest()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, indent=2))

    by_track: dict[str, int] = {}
    for p in manifest:
        by_track[p["role_track"]] = by_track.get(p["role_track"], 0) + 1
    print(f"Wrote {len(manifest)} pairs to {OUT}")
    for t, n in by_track.items():
        print(f"  {t}: {n} pairs")
    # Spot-check: print the first resume and first JD for the first track only.
    if manifest:
        print("\n--- Sample resume (first pair) ---")
        print(manifest[0]["resume"])
        print("--- Sample JD (first pair) ---")
        print(manifest[0]["jd"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
