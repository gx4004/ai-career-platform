"""Regression coverage for the `extract_job_keywords` / `keyword_present`
generic-term and skill-family bugs (held bug #1, Sept reset).

Two independent defects were shipped together and are covered separately:

1. Generic job-posting filler ("Learn", "Ability", ...) survived the stopword
   filter and got promoted to a "missing skill" keyword whenever the resume
   didn't happen to contain that literal word.
2. `keyword_present("SQL", ...)` used a plain `\\bsql\\b` word-boundary regex,
   so a resume that only said "PostgreSQL" (no bare "SQL") was scored as
   missing the SQL requirement even though `extract_detected_skills` already
   recognizes PostgreSQL as a SQL-family skill.
"""

from app.services.quality_signals import extract_job_keywords, keyword_present


def test_generic_filler_words_are_not_extracted_as_keywords():
    jd = (
        "Backend Engineer\n"
        "Ability to learn quickly and work in a fast-paced environment. "
        "Excellent communication skills required. Bachelor's degree preferred. "
        "Responsibilities include ensuring code quality."
    )

    keywords = extract_job_keywords(jd)
    lowered = {kw.lower() for kw in keywords}

    for generic in ("learn", "ability", "abilities", "excellent", "required",
                     "preferred", "responsibilities", "environment", "ensuring",
                     "bachelor"):
        assert generic not in lowered, f"{generic!r} should be filtered as generic filler"


def test_real_requirement_survives_next_to_generic_filler():
    jd = "Backend Engineer\nAbility to learn Kubernetes quickly is required."
    keywords = extract_job_keywords(jd)
    assert "Kubernetes" in keywords


def test_keyword_present_matches_sql_family_synonyms():
    # PostgreSQL, MySQL, T-SQL etc. are SQL-family skills — a resume naming any
    # of them should satisfy a bare "SQL" requirement.
    assert keyword_present("SQL", "5 years of PostgreSQL experience.")
    assert keyword_present("SQL", "Wrote complex MySQL queries.")
    assert keyword_present("SQL", "Comfortable with T-SQL stored procedures.")
    assert keyword_present("SQL", "Owns our SQLite-backed cache.")
    assert keyword_present("SQL", "Standard SQL across the stack.")


def test_keyword_present_does_not_match_unrelated_skills():
    # Guards against over-matching once the family lookup is in place: a
    # keyword with no relation to the resume text stays absent.
    assert not keyword_present("Kubernetes", "We deploy with Docker only.")
    assert not keyword_present("SQL", "We only work with MongoDB and Redis.")


import pytest  # noqa: E402

from app.services.quality_signals import extract_role_label  # noqa: E402


@pytest.mark.parametrize(
    ("job_description", "expected"),
    [
        ("Senior Backend Engineer\nAcme builds payments.", "Senior Backend Engineer"),
        ("Job Title: Senior Backend Engineer (Remote)\nAbout us", "Senior Backend Engineer"),
        (
            "About Acme\nWe are hiring a Senior Backend Engineer to join our platform team.",
            "Senior Backend Engineer",
        ),
        ("Senior Backend Engineer - Remote (EU) | Full-time", "Senior Backend Engineer"),
        ("## Staff Product Designer, Growth", "Staff Product Designer"),
        ("Position: Data Analyst II at Globex Corp", "Data Analyst II"),
        ("We're looking for an experienced Engineering Manager who loves people.", "Engineering Manager"),
        ("senior backend engineer", "Senior Backend Engineer"),
    ],
)
def test_extract_role_label_returns_a_clean_title(job_description, expected):
    assert extract_role_label(job_description) == expected


def test_extract_role_label_ignores_role_words_used_in_prose():
    assert extract_role_label("You will lead a team of five across two time zones.") is None
    assert extract_role_label("") is None
    assert extract_role_label("Great benefits and a friendly office.") is None


# --- Skill keyword quality: only real skills, never function words/generic verbs.

import pytest  # noqa: E402

_JUNK = {
    "behind", "billing", "lead", "design", "pipelines", "migrations", "own", "build",
    "services", "platform", "team", "teams", "product", "products", "customers",
    "customer", "will", "you", "using", "strong", "across", "drive", "grow",
    "manage", "create", "campaigns", "content", "users", "user", "data", "work",
    "engineers", "engineering", "experience", "years", "mentor", "schemas", "with",
}

_JOB_CASES = [
    (
        "backend",
        "Own the Python and FastAPI services behind our billing platform. You will "
        "design PostgreSQL schemas, lead migrations, and build CI/CD pipelines with "
        "Docker on AWS.",
        {"Python", "FastAPI", "PostgreSQL", "CI/CD", "Docker", "AWS", "Schema Design", "Data Migrations"},
    ),
    (
        "frontend",
        "We are hiring a frontend engineer. You will ship interfaces with strong accessibility in "
        "React and TypeScript, build a component library in Tailwind CSS, and write "
        "tests with Jest. Experience with Next.js and GraphQL is a plus.",
        {"React", "TypeScript", "Tailwind CSS", "Next.js", "Accessibility"},
    ),
    (
        "data",
        "Join our data team to build ETL pipelines in Airflow and dbt on Snowflake. "
        "You will model data in SQL, create dashboards in Tableau and use Python "
        "with Pandas for analysis.",
        {"Airflow", "dbt", "Snowflake", "SQL", "Tableau", "Python", "Pandas", "ETL"},
    ),
    (
        "design",
        "Lead the design of our mobile experience. You will run user research, "
        "create wireframes and prototypes in Figma, and maintain our design system "
        "with a strong eye for typography and accessibility.",
        {"Figma", "User Research", "Wireframing", "Prototyping", "Accessibility", "Design Systems"},
    ),
    (
        "marketing",
        "Grow our pipeline through content marketing, SEO and email marketing. "
        "You will manage campaigns in HubSpot, report on Google Analytics, run "
        "A/B tests and write strong copy for our customers.",
        {"Content Marketing", "SEO", "Email Marketing", "HubSpot", "Google Analytics", "A/B Testing"},
    ),
]


@pytest.mark.parametrize(("name", "jd", "expected"), _JOB_CASES, ids=[c[0] for c in _JOB_CASES])
def test_job_keywords_are_real_skills_only(name, jd, expected):
    keywords = extract_job_keywords(jd, limit=12)
    lowered = {k.lower() for k in keywords}
    assert not (lowered & _JUNK), f"{name}: junk keywords {lowered & _JUNK}"
    missing = {k for k in expected if k not in keywords}
    assert not missing, f"{name}: missing {missing} in {keywords}"


def test_unknown_camelcase_tool_is_kept_but_plain_words_are_not():
    keywords = extract_job_keywords("You will maintain our SQLAlchemy models and lead the platform billing work.")
    assert "SQLAlchemy" in keywords
    assert not {k.lower() for k in keywords} & {"lead", "platform", "billing", "maintain", "models"}


def test_postgres_replaces_generic_sql_when_flavour_named():
    keywords = extract_job_keywords("Design PostgreSQL schemas.")
    assert "PostgreSQL" in keywords
    assert "SQL" not in keywords


def test_keyword_present_handles_multiword_and_variant_skills():
    assert keyword_present("PostgreSQL", "Tuned Postgres queries for 5 years")
    assert keyword_present("PostgreSQL", "Managed POSTGRESQL clusters")
    assert not keyword_present("PostgreSQL", "MySQL only")
    assert keyword_present("JavaScript", "Built UIs with JS and HTML")
    assert keyword_present("Schema Design", "Designed relational schemas for billing")
    assert keyword_present("Data Migrations", "Ran zero-downtime database migrations")
    assert keyword_present("CI/CD", "Set up GitHub Actions pipelines")
    assert keyword_present("User Research", "Conducted usability testing sessions")
    assert not keyword_present("Schema Design", "Wrote Python scripts")


def test_ambiguous_words_are_not_skills_when_used_as_plain_english():
    jd = "Excel at stakeholder work, spark innovation, make swift decisions in a rust-free stack. Postgres, Docker."
    lowered = {k.lower() for k in extract_job_keywords(jd, limit=12)}
    assert not lowered & {"excel", "spark", "swift", "rust"}
    assert {"postgresql", "docker"} <= lowered
    real = {k.lower() for k in extract_job_keywords("Apache Spark and Microsoft Excel; Swift and Kotlin apps.")}
    assert {"spark", "excel", "swift", "kotlin"} <= real
