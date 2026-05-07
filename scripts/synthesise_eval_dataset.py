"""Synthesise the comparative-study evaluation dataset for Chapter 4.3.

Produces ``thesis/eval-dataset.json`` deterministically — same seed, identical
output — so the evaluation manifest is reproducible and defensible at viva.
The dataset has the shape the eval harness expects::

    [{"id": "r-backend-02__jd-backend-01", "resume": "...", "jd": "...",
      "role_track": "backend",
      "_resume_bullets": ["..."],          # phrases sampled from resume_phrases
      "_jd_responsibilities": ["..."]},    # phrases sampled from jd_phrases
     ...]

The two `_*` fields are eval-side metadata used by the disjoint-vocabulary
verification script (``scripts/verify_disjoint_pools.py``); the live eval
harness ignores them. The `resume`/`jd` text fields are the inputs the
analyzer service consumes.

Design (aligned with the ESCO subset bundled at backend/app/data/esco_skills.json):

* 6 role tracks: backend, frontend, fullstack, data, design, pm.
* 5 synthetic resumes per track (30 total) varying in seniority and skill
  density. Each resume is well above the 140-word v2 thin-resume threshold.
* 3-4 synthetic job descriptions per track (20 total).
* In-track pairing: every resume × every JD inside its own track. With the
  3/3/3/3/4/4 JD distribution this yields exactly 100 pairs.

T1-mitigation note (Stage G, May 2026): each track now exposes two
disjoint phrase pools — `resume_phrases` (past-tense achievement framing)
and `jd_phrases` (future-tense requirement framing) — instead of the
single shared `responsibilities` pool that fed both sides in the original
construction. The two pools are lexically disjoint at the content-word
level (excluding stop-words and the role-domain skill terms), so that
keyword-overlap measurements between resume and JD are not artefactually
inflated by phrase identity. The original leakage-version dataset is
archived as ``thesis/eval-dataset-with-leakage.json``.

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
#
# T1 mitigation: each track now defines `resume_phrases` (past-tense
# achievement framing) and `jd_phrases` (future-tense requirement framing)
# as two disjoint sub-pools. Skill terms (Python, React, ...) and role
# titles ("backend", "frontend", ...) are intentionally allowed in both
# pools because skill matching is the supervised signal the system is
# meant to detect. What was eliminated is the sharing of full phrase
# templates across both sides, which previously produced near-tautological
# keyword overlap.
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
        "resume_phrases": [
            "shipped REST endpoints handling production traffic without regression",
            "owned the schema and the Alembic migration history end-to-end",
            "broke a monolithic codebase into independently deployable microservices",
            "instrumented structured logging and distributed tracing throughout the request path",
            "hardened authentication using OAuth2 token rotation and refresh handling",
            "rewrote the slowest write path to use background queues and warm caches",
            "built the integration-test harness that now gates every pull request",
            "ran the weekly on-call rotation for the payments domain",
            "wired Sentry breadcrumbs through the analytical-tool dispatch path",
            "fortified the data-export endpoint against memory exhaustion under heavy load",
            "automated the release pipeline using Alembic and GitHub Actions",
            "refactored the legacy authentication module into a typed, well-tested package",
            "authored the disaster-recovery runbook exercised in the weekly drill",
            "drove the v1 endpoint deprecation without breaking external integrations",
            "delivered the read-replica failover playbook adopted by the reliability group",
            "engineered the idempotent webhook handler used by external billing partners",
            "refitted the upload pipeline to stream large files instead of buffering them",
            "built the synthetic-load rig that uncovered a connection-pool leak",
            "cut median deployment time from forty minutes to eight by parallelising the test stages",
            "introduced the rate-limiting middleware protecting the public API surface",
        ],
        "jd_phrases": [
            "be accountable for service-architecture decisions across our platform",
            "lead the design of new capabilities consumed by partner squads",
            "embed alongside infrastructure to evolve our deployment posture",
            "improve our on-call culture by raising operational maturity",
            "shape data-modelling conventions adopted by every product surface",
            "ensure the public surface remains stable while we onboard fresh clients",
            "guide juniors through review and pair-programming sessions",
            "help define the long-term posture for inter-service contracts",
            "evolve our continuous-delivery pipeline as the team scales",
            "drive resilience improvements that reduce paging volume each quarter",
            "champion good practices around secret handling and production access",
            "influence the multi-region rollout plan for our compute footprint",
            "translate ambiguous business requirements into well-bounded service interfaces",
            "improve developer ergonomics through better local-development tooling",
            "raise the bar on observability across the analytical surface",
            "represent engineering in roadmap discussions with product and operations",
            "facilitate technical-design conversations during quarterly planning cycles",
            "iterate on the platform's typed-contract abstractions used by every squad",
            "mentor newer engineers through structured onboarding and skill development",
            "set the technical direction for our asynchronous messaging substrate",
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
        "resume_phrases": [
            "built reusable component libraries with strict TypeScript types",
            "owned the design-token catalogue and migrated three product surfaces onto it",
            "wrote end-to-end tests covering the critical user flows",
            "improved Lighthouse scores on the marketing pages from 62 to 91",
            "led the migration from a legacy Webpack pipeline to Vite",
            "shipped accessibility fixes that brought WCAG compliance up to AA",
            "introduced Storybook-driven component review across the team",
            "rewrote the dashboard rendering layer to eliminate hydration mismatches",
            "trimmed 220 kilobytes of unused JavaScript from the main bundle",
            "delivered a typed forms abstraction now used across four product teams",
            "instrumented Real User Monitoring on the upgrade flow",
            "refactored the routing layer to support code-split lazy loading",
            "introduced a strict-mode TypeScript baseline across the legacy app",
            "engineered the dark-mode theming layer respecting OS preference",
            "diagnosed and fixed a long-running CSS-grid bug on Safari iOS",
            "set up visual-regression testing using Percy on every pull request",
            "rebuilt the upgrade modal that lifted A/B-test win rate by 18%",
            "migrated three legacy survey forms into a shared typed contract",
            "drove the deprecation of CSS-in-JS in favour of utility classes",
            "shipped the offline-cache layer that survives flaky mobile networks",
        ],
        "jd_phrases": [
            "shape the visual language of our product across every flow",
            "raise component-library quality through review and shared conventions",
            "partner with product designers to translate Figma into accessible interfaces",
            "champion measurable performance improvements on the marketing site",
            "you will own the design-system roadmap as the product expands",
            "ensure new pages clear our accessibility checklist before launch",
            "evolve the test posture so flake stops blocking release cadence",
            "guide juniors through code review on architecturally tricky changes",
            "embed alongside the platform team to influence build-tooling choices",
            "set the bar for typed safety on the customer-facing surface",
            "improve developer experience by reducing local-build friction",
            "represent engineering in cross-functional design critiques weekly",
            "iterate on the analytics-instrumentation contract used by growth",
            "lift our Web Vitals story across mobile and tablet form factors",
            "scope and estimate quarterly initiatives alongside the product manager",
            "mentor newer engineers through onboarding and skill development",
            "drive the migration off our legacy router as our needs change",
            "facilitate technical-design conversations during planning cycles",
            "translate ambiguous product briefs into shipping component contracts",
            "establish the operating cadence for visual-regression review",
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
        "resume_phrases": [
            "owned a feature end-to-end from API design through UI polish",
            "shipped the realtime collaboration backend on top of WebSocket fan-out",
            "rewrote the legacy Express.js API into a typed Node.js service",
            "built the local-stack tooling that lets engineers spin up the whole product",
            "introduced a typed contract between the React client and the Node API",
            "drove the migration from REST to GraphQL on the customer-facing app",
            "delivered the company's first product launch in under twelve weeks",
            "refactored the persistence layer to support optimistic updates",
            "engineered the file-upload pipeline used by every customer surface",
            "wrote the deployment script that replaced manual cloud orchestration",
            "instrumented full-stack tracing tying React errors back to API calls",
            "introduced contract tests that caught three breaking-change incidents",
            "automated the staging-data refresh that engineers used every morning",
            "rebuilt the auth flow with refresh-token rotation and silent renewal",
            "shipped the typed end-to-end stack now used on every new product surface",
            "drove the deprecation of three legacy admin tools in one quarter",
            "delivered a webhook fan-out service consumed by external partners",
            "rewrote the search experience with debounced typeahead and server cache",
            "set up the observability stack covering both browser and server",
            "halved API-to-UI integration bugs through shared type generation",
        ],
        "jd_phrases": [
            "be the bridge between product engineering and platform infrastructure",
            "lead end-to-end ownership of customer-visible features",
            "shape the contract between our React client and the Node services",
            "evolve our typed-stack story as the product grows",
            "champion the cross-cutting test posture spanning UI and API",
            "you will guide product engineers through full-stack design reviews",
            "raise our developer-experience baseline across the full local stack",
            "ensure every new feature ships with measurement built in",
            "embed within product teams during high-priority launch windows",
            "mentor newer engineers as they build cross-cutting features",
            "drive the modernisation of our legacy admin surface",
            "set technical direction for our internal tooling roadmap",
            "improve our deployment cadence by removing release-day friction",
            "facilitate technical-design conversations spanning multiple repositories",
            "translate fuzzy product briefs into shipping vertical slices",
            "represent engineering during cross-functional planning rituals",
            "scope quarterly initiatives jointly with product managers",
            "iterate on the shared component-and-API contract layer",
            "raise the bar on observability covering browser and server uniformly",
            "establish onboarding pathways so new engineers are productive quickly",
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
        "resume_phrases": [
            "built the daily revenue dashboard powering the executive review",
            "designed the Airflow DAGs landing nightly into the warehouse",
            "owned the customer-segmentation model used by marketing",
            "ran exploratory analyses on retention, churn, and feature adoption",
            "translated ambiguous product questions into measurable hypotheses",
            "modelled the warehouse layer that became the single source of truth",
            "halved the marketing team's time-to-KPI on weekly reporting",
            "uncovered a data-quality regression that distorted retention reporting for two quarters",
            "shipped the first cohort-analysis dashboard the leadership team relies on",
            "identified the segment producing 42% of incremental revenue",
            "wrote the SLA monitor that alerts when nightly loads slip",
            "automated the daily snapshot reconciliation between Stripe and the warehouse",
            "rebuilt the retention model after discovering the prior cohort definition was wrong",
            "drove the consolidation of three legacy reporting stacks into one warehouse",
            "delivered the experiment-readout template adopted across product surfaces",
            "engineered the streaming ingest path replacing nightly batch loads",
            "introduced row-level access controls on the warehouse for personal-data scopes",
            "rewrote the feature-flag analytics layer to attribute properly to test arms",
            "set up the change-data-capture replication from Postgres to BigQuery",
            "trained marketing in self-serve dashboard authoring through quarterly workshops",
        ],
        "jd_phrases": [
            "shape the analytics roadmap for revenue and growth",
            "partner with product to define meaningful experiment metrics",
            "evolve the warehouse architecture as data volume grows",
            "champion data quality across every reporting surface",
            "be responsible for the integrity of executive-level metrics",
            "you will drive the adoption of self-serve reporting across the company",
            "guide analysts through data-modelling conversations weekly",
            "raise the bar on statistical rigour in experiment readouts",
            "ensure new pipelines ship with monitoring and lineage built in",
            "embed alongside finance during quarterly close cycles",
            "translate vague leadership questions into measurable KPIs",
            "represent the data team in cross-functional planning rituals",
            "improve the warehouse-onboarding experience for new analysts",
            "scope quarterly initiatives jointly with product and finance",
            "set the operational cadence for data-quality incident response",
            "facilitate cross-team conversations about metric definitions",
            "iterate on the experiment-platform contract used by growth",
            "lift the team's analytical-engineering practice through review and mentorship",
            "establish the on-call expectations for the data platform",
            "mentor newer analysts as they progress into senior responsibility",
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
        "resume_phrases": [
            "owned the end-to-end design of the onboarding flow",
            "built and maintained the product's design-system library in Figma",
            "ran weekly user interviews and translated findings into product changes",
            "produced high-fidelity prototypes that engineering shipped without rework",
            "led the accessibility audit and the WCAG-AA remediation plan",
            "facilitated cross-functional design reviews with engineering and product",
            "tripled adoption of the upgraded settings UI within four weeks of launch",
            "shipped the redesign that reduced support-ticket volume on billing by 31%",
            "consolidated three legacy component libraries into one cohesive system",
            "mapped the existing onboarding funnel using session-replay evidence",
            "rebuilt the empty-state language across the dashboard for clarity",
            "delivered the visual-regression checklist adopted by the engineering team",
            "drove the deprecation of three legacy modal patterns over a quarter",
            "engineered tighter handoff loops with engineering using Figma Variables",
            "introduced typography guidelines covering web, email, and mobile surfaces",
            "wrote the brand voice and tone guide used across product copy",
            "rebuilt the navigation pattern after research showed users could not find settings",
            "produced the dark-mode token palette that engineering adopted unchanged",
            "ran moderated usability testing on five major flows with N=8 participants each",
            "shipped the responsive table pattern now used across analytics surfaces",
        ],
        "jd_phrases": [
            "shape the visual language of our product as it scales",
            "be responsible for design quality across every customer-facing flow",
            "you will lead onboarding-flow research and iterate based on findings",
            "evolve our design-system tokens as new product areas come online",
            "champion accessibility on every screen we ship",
            "partner with engineering during weekly review and Figma critique",
            "guide juniors through portfolio reviews and structured feedback",
            "raise the bar on prototype fidelity for executive demos",
            "ensure the design-engineering handoff stays low-friction as we grow",
            "facilitate cross-functional research conversations during planning",
            "translate ambiguous product briefs into shippable design directions",
            "represent design in roadmap discussions with product and operations",
            "iterate on the brand-voice guide used by marketing and product",
            "embed alongside engineering during high-priority launch windows",
            "mentor newer designers through onboarding and skill development",
            "scope quarterly design initiatives jointly with product managers",
            "improve our research-debrief cadence so insights reach engineering quickly",
            "set the bar on documentation quality for component-library entries",
            "establish the operating cadence for design-system review meetings",
            "lift the design-engineering shared-vocabulary baseline across the org",
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
        "resume_phrases": [
            "owned the roadmap for a product surface used by tens of thousands of users",
            "ran weekly customer-research conversations and synthesised them into product bets",
            "designed the experimentation framework the team now uses by default",
            "wrote the quarterly OKRs and led the cross-functional planning rituals",
            "drove the discovery work that produced the team's largest launch of the year",
            "negotiated scope across engineering, design, and go-to-market",
            "shipped a feature that lifted activation by 22% within one quarter",
            "killed a half-built initiative after research showed weak demand",
            "led the launch that opened the company's second monetisation surface",
            "rebuilt the prioritisation framework that engineering adopted org-wide",
            "delivered the customer-feedback ingest pipeline used in roadmap planning",
            "ran the pricing-experiment programme that informed two quarterly bets",
            "engineered the cross-functional kickoff ritual now used by every team",
            "wrote the post-launch readout template adopted across product",
            "drove the deprecation of three legacy admin features in one quarter",
            "introduced a structured discovery review cadence with engineering and design",
            "rebuilt the user-research panel from scratch after a vendor change",
            "shipped the win/loss-analysis programme that informs product strategy",
            "negotiated a phased migration timeline with two enterprise customers",
            "produced the metrics tree that anchored quarterly OKR conversations",
        ],
        "jd_phrases": [
            "be responsible for the long-term roadmap of a meaningful product surface",
            "shape the discovery-to-delivery cadence as the team scales",
            "champion customer-research depth in every feature decision",
            "you will lead cross-functional kickoffs spanning engineering and design",
            "ensure roadmap conversations stay grounded in measurable outcomes",
            "evolve the operating model so quarterly bets ship on cadence",
            "guide newer product managers through prioritisation and trade-offs",
            "raise the bar on launch readiness across customer-facing initiatives",
            "partner with executives on quarterly metric review and goal setting",
            "embed alongside engineering during architectural-decision conversations",
            "translate fuzzy executive direction into shippable product bets",
            "represent product in cross-functional planning rituals weekly",
            "facilitate the discovery review cadence with research and design",
            "iterate on the experimentation programme used by growth",
            "scope quarterly initiatives jointly with engineering leadership",
            "improve the win-loss feedback loop so it informs roadmap directly",
            "mentor newer product managers through structured onboarding",
            "set the bar on launch communication across customer success",
            "establish the operating cadence for cross-team kickoff rituals",
            "lift the team's experimentation maturity through review and coaching",
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
    "Track record of leaving systems in a better state than the prior team did.",
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

def make_resume(
    track_id: str, idx: int, name: str, rng: random.Random
) -> tuple[str, list[str]]:
    """Compose a synthetic resume of ~250-400 words for `track_id` at seniority `idx`.

    Returns (resume_text, sampled_resume_phrases). The second value is the
    flat list of phrase strings drawn from track["resume_phrases"] across
    all jobs in this resume (one entry per bullet placement). The list is
    used by the disjoint-pool verification.
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
    sampled_resume_phrases: list[str] = []
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
        # Every job gets 3 resume phrases and 1 achievement bullet so even
        # juniors clear the 140-word v2 thin-resume floor. Resume phrases
        # come from the disjoint resume_phrases pool (T1 mitigation).
        bullets = rng.sample(
            track["resume_phrases"],
            k=min(3, len(track["resume_phrases"])),
        )
        sampled_resume_phrases.extend(bullets)
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
    return text, sampled_resume_phrases


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


def make_jd(
    track_id: str, idx: int, rng: random.Random
) -> tuple[str, list[str]]:
    """Compose a synthetic job description of ~180-260 words for `track_id`.

    Returns (jd_text, sampled_jd_phrases). The second value lists the JD
    responsibility bullets drawn from track["jd_phrases"] for this JD; it
    is consumed by the disjoint-pool verification.
    """
    track = TRACKS[track_id]
    title, level = track["jd_titles"][idx]
    company_descriptor = rng.choice(track["companies"])
    intro = rng.choice(JD_INTROS).format(title=title, company_descriptor=company_descriptor)

    # Responsibilities — 4 bullets sampled from the disjoint jd_phrases pool.
    resps = rng.sample(track["jd_phrases"], k=min(4, len(track["jd_phrases"])))

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
    return "\n".join(parts).strip() + "\n", resps


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
        track_resumes: list[tuple[str, str, list[str]]] = []
        for r_idx in range(5):
            name = name_pool[name_idx]
            name_idx += 1
            resume_text, resume_bullets = make_resume(track_id, r_idx, name, rng)
            track_resumes.append((f"r-{track_id}-{r_idx + 1:02d}", resume_text, resume_bullets))

        # 3-4 JDs per track (driven by len(jd_titles))
        track_jds: list[tuple[str, str, list[str]]] = []
        for j_idx in range(len(TRACKS[track_id]["jd_titles"])):
            jd_text, jd_resps = make_jd(track_id, j_idx, rng)
            track_jds.append((f"jd-{track_id}-{j_idx + 1:02d}", jd_text, jd_resps))

        # In-track pairing: every resume × every JD.
        for r_id, r_text, r_bullets in track_resumes:
            for j_id, j_text, j_resps in track_jds:
                pairs.append({
                    "id": f"{r_id}__{j_id}",
                    "resume": r_text,
                    "jd": j_text,
                    "role_track": track_id,
                    # T1-mitigation traceability (consumed by verify_disjoint_pools.py;
                    # ignored by the live eval harness).
                    "_resume_bullets": r_bullets,
                    "_jd_responsibilities": j_resps,
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
