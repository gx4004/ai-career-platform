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
