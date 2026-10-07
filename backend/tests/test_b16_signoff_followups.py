"""B16: backend and demo-data items the final sign-off could not fix (2026-10-06).

Every tool test drives the real route with ``LLM_PROVIDER=fake``, so what is asserted is
what a person running the app locally (or the owner's demo account) sees.
"""

from __future__ import annotations

import io
import re
from datetime import UTC, datetime

import fitz
import pytest
from docx import Document

from app.config import settings
from app.models.application_snapshot import ApplicationSnapshot
from app.models.campaign_event import CampaignEvent
from app.models.cv_document import CvDocument
from app.models.workspace import Workspace
from app.services.result_cache import clear_cache

PREFIX = "/api/v1"
CV = f"{PREFIX}/cv-documents"
EVIDENCE = f"{PREFIX}/evidence-profile/items"

# The demo resume (frontend/scripts/seed-demo.mjs): bullets hard-wrapped at ~75 characters.
WRAPPED_RESUME = """Alex Morgan
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python
services, data pipelines, and internal platforms for distributed teams.

Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced
  request latency by 35 percent through query tuning and cache design.
- Owned PostgreSQL schema changes, migration rehearsals, monitoring, and
  incident response for a workflow processing 2 million events a month.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes
  while preserving rollback and audit controls.
- Mentored four engineers and coordinated delivery with product, design,
  security, and support partners across three quarterly releases.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS

Education
BSc Computer Science
"""

DEMO_JD = """Senior Backend Engineer (Platform)

We're hiring a backend engineer to own our FastAPI services and PostgreSQL
data layer. You'll lead schema migrations, build CI/CD pipelines, and
mentor engineers across product teams. Required: Python, FastAPI,
PostgreSQL, SQLAlchemy, Docker, and CI/CD experience. AWS a plus."""

# The sign-off's F09 repro: a normally pasted posting, title and company on the first line.
PASTED_JD = """Senior Backend Engineer, Platform at Northwind Labs (Berlin, hybrid).
We need Python, PostgreSQL and mentoring, plus Kubernetes, Terraform, Kafka, Go, Rust, gRPC and Elasticsearch in production."""

JUNIOR_RESUME = """Sam Lee
Junior Developer
Summary
Recent graduate who built small web apps in Python and JavaScript.
Experience
- Built a Flask app for a student club with 50 users.
- Fixed bugs in a React dashboard during a summer internship.
Skills
Python, JavaScript, React, Git
Education
BSc Computer Science, 2025
"""


@pytest.fixture(autouse=True)
def _fake_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")
    clear_cache()
    yield
    clear_cache()


def _post(client, headers, path, body, status=200):
    response = client.post(f"{PREFIX}{path}", json=body, headers=headers)
    assert response.status_code == status, response.text
    return response.json()


def _quotes(text: str) -> list[str]:
    return re.findall(r'"([^"]{8,})"', text)


# --- Item 1: template descriptions promise only what the renderer draws --------------------


def _cv_with_content(client, headers, sections):
    return _post(client, headers, "/cv-documents", {"name": "Alex Morgan", "sections": sections}, 201)


SUMMARY = {
    "id": "summary",
    "kind": "summary",
    "title": "Summary",
    "position": 0,
    "entries": [
        {"id": "s1", "evidence_item_id": None, "position": 0, "body": "Backend engineer building Python services."}
    ],
}


def test_template_descriptions_promise_no_typeface_the_export_does_not_use(client, auth_headers):
    catalog = client.get(f"{CV}/style-catalog", headers=auth_headers).json()
    document = _cv_with_content(client, auth_headers, [SUMMARY])
    for template in catalog["templates"]:
        patched = client.patch(
            f"{CV}/{document['id']}", json={"style": {"template_id": template["id"]}}, headers=auth_headers
        )
        assert patched.status_code == 200, patched.text
        pdf = client.get(f"{CV}/{document['id']}/artifacts/pdf", headers=auth_headers)
        fonts = " ".join(font[3] for page in fitz.open(stream=pdf.content, filetype="pdf") for font in page.get_fonts())
        description = template["description"].lower()
        # A description may not promise serif or monospace type the PDF does not embed.
        # "monogram" (lagoon, rail) is a design element, not a typeface: match whole words only.
        if re.search(r"(?<!sans-)\bserif\b", description):
            assert re.search(r"serif|times|georgia|garamond|lora", fonts, re.I), (template["id"], fonts)
        if re.search(r"\bmono(?:space|spaced)?\b", description):
            assert re.search(r"mono|courier", fonts, re.I), (template["id"], fonts)
        if re.search(r"\bcent(?:er|re)", description):
            assert template["title_align"] == "center", template["id"]


# --- Item 2: an empty section never exports as a bare heading -------------------------------


def test_an_empty_section_is_left_out_of_the_pdf_and_docx(client, auth_headers):
    empty_projects = {"id": "projects", "kind": "projects", "title": "Projects", "position": 1, "entries": []}
    document = _cv_with_content(client, auth_headers, [SUMMARY, empty_projects])

    pdf = client.get(f"{CV}/{document['id']}/artifacts/pdf", headers=auth_headers)
    pdf_text = "\n".join(page.get_text() for page in fitz.open(stream=pdf.content, filetype="pdf"))
    docx = client.get(f"{CV}/{document['id']}/artifacts/docx", headers=auth_headers)
    docx_text = "\n".join(p.text for p in Document(io.BytesIO(docx.content)).paragraphs)

    for text in (pdf_text, docx_text):
        assert "Backend engineer building Python services." in text
        assert "Projects" not in text

    # The quality check re-reads that same PDF: a bare heading would fail its read-back
    # (a section with no text) and its page-break check (a heading with no first entry).
    quality = client.post(f"{CV}/{document['id']}/quality", headers=auth_headers)
    assert quality.status_code == 200, quality.text
    checks = {check["id"]: check for check in quality.json()["checks"]}
    assert checks["reads_back"]["passed"] and checks["page_breaks"]["passed"], checks


# --- Item 3: a CV seeded from profile skills has one Skills line, not one entry per fact -----


def test_seeding_from_profile_merges_skill_facts_into_one_entry(client, auth_headers):
    ids = []
    for content in ({"name": "Python"}, {"statement": "SQL and dbt"}, {"text": "Docker, AWS, CI/CD"}):
        response = client.post(
            EVIDENCE, json={"kind": "skill", "content": content, "provenance": "user-entered"}, headers=auth_headers
        )
        assert response.status_code == 201, response.text
        ids.append(response.json()["id"])

    document = _post(
        client, auth_headers, "/cv-documents", {"name": "From profile", "sections": [], "seed_evidence_item_ids": ids}, 201
    )

    (skills,) = [section for section in document["sections"] if section["kind"] == "skills"]
    assert [entry["body"] for entry in skills["entries"]] == ["Python, SQL and dbt, Docker, AWS, CI/CD"]
    pdf = client.get(f"{CV}/{document['id']}/artifacts/pdf", headers=auth_headers)
    pdf_text = " ".join(page.get_text() for page in fitz.open(stream=pdf.content, filetype="pdf"))
    assert "Python, SQL and dbt, Docker, AWS, CI/CD" in " ".join(pdf_text.split())


# --- Item 4: fake provider copy ---------------------------------------------------------------


def test_borderline_headline_counts_requirements_not_keywords(client, auth_headers):
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": DEMO_JD})
    assert data["verdict"] == "borderline"
    rows = data["requirements"]
    met = sum(1 for row in rows if row["status"] == "matched")
    # The page's "Requirements met 3 of 6" bar and the headline must agree.
    assert f"You match {met} of {len(rows)} requirements" in data["summary"]["headline"]


def test_stretch_headline_names_every_matched_requirement(client, auth_headers):
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": PASTED_JD})
    assert data["verdict"] == "stretch"
    matched = [row["requirement"] for row in data["requirements"] if row["status"] == "matched"]
    assert len(matched) >= 2
    headline = data["summary"]["headline"]
    for requirement in matched:
        assert requirement in headline
    assert "lines up" not in headline  # several requirements "line up"


def test_career_says_an_entry_level_profile(client, auth_headers):
    data = _post(client, auth_headers, "/career/recommend", {"resume_text": JUNIOR_RESUME, "target_role": ""})
    why_now = data["recommended_direction"]["why_now"]
    assert "a entry" not in why_now
    assert "an entry-level profile" in why_now


def test_cover_letter_keeps_skill_names_capitalised(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": JUNIOR_RESUME, "job_description": "Junior Developer at Contoso\nWe use Python, React and Git."},
    )
    text = data["full_text"]
    assert "python" not in text and "react" not in text.replace("React", "")
    assert "Python" in text


@pytest.mark.parametrize("target_role", ["", "Platform Engineer", "Staff Platform Engineer"])
def test_career_recommends_the_best_scored_direction(client, auth_headers, target_role):
    data = _post(client, auth_headers, "/career/recommend", {"resume_text": WRAPPED_RESUME, "target_role": target_role})
    recommended = data["recommended_direction"]
    scores = [path["fit_score"] for path in data["paths"]]
    assert recommended["fit_score"] == max(scores)
    assert data["paths"][0]["role_title"] == recommended["role_title"]
    assert scores == sorted(scores, reverse=True)
    if target_role:
        # The role the person named is still read, with its own fit and gaps.
        assert any(path["role_title"] == target_role for path in data["paths"])
        if recommended["role_title"] != target_role:
            assert target_role in recommended["why_now"]


def test_practice_feedback_never_suggests_a_stopword(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/interview/practice-feedback",
        {
            "question": "Tell me about a risky release you owned.",
            "user_answer": "I owned the billing release. I split it into phases and cut errors by 40% in two weeks.",
            "model_answer": "Walk through the database migration upfront, because rollback planning matters.",
        },
    )
    touches = [item for item in data["suggestions"] if "also touches on" in item]
    assert touches, data["suggestions"]
    assert '"database"' in touches[0]


def test_practice_feedback_counts_word_quantities_as_numbers(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/interview/practice-feedback",
        {
            "question": "Tell me about a time you improved a slow process.",
            "user_answer": (
                "I owned our release process. I automated the checks, cut the review time by a third "
                "and we doubled the release cadence within the quarter, which I then documented."
            ),
        },
    )
    assert not any("no number" in item for item in data["weaknesses"])
    assert any("a third" in item or "doubled" in item for item in data["strengths"])


def test_practice_feedback_with_nothing_to_fix_does_not_say_biggest_fix(client, auth_headers):
    answer = (
        "At Northwind I owned the checkout service when it slowed down at peak. I profiled it, found one hot "
        "query, added a Redis cache and rewrote the index, which cut p95 latency by 30% and saved two servers. "
        "I then wrote a runbook so the team could repeat it, and I walked the on-call rotation through it so "
        "nobody depended on me. The next peak passed without a page, and I used the same approach on search."
    )
    data = _post(
        client,
        auth_headers,
        "/interview/practice-feedback",
        {"question": "Tell me about a time you improved the performance of a slow service.", "user_answer": answer},
    )
    assert not data["weaknesses"]
    assert "Biggest fix" not in data["overall_feedback"]


def test_resume_quote_questions_end_the_quote_before_asking(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/interview/questions",
        {"resume_text": WRAPPED_RESUME, "job_description": "Senior Backend Engineer at Northwind\nPython, FastAPI, PostgreSQL."},
    )
    quoted = [item["question"] for item in data["questions"] if "resume says:" in item["question"]]
    assert quoted
    for question in quoted:
        assert re.search(r'[.!?…]"\s+What\b', question), question


def test_hard_wrapped_bullets_are_quoted_whole(client, auth_headers):
    match = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": DEMO_JD})
    resume = _post(client, auth_headers, "/resume/analyze", {"resume_text": WRAPPED_RESUME})
    questions = _post(
        client,
        auth_headers,
        "/interview/questions",
        {"resume_text": WRAPPED_RESUME, "job_description": "Senior Backend Engineer at Northwind\nPython, FastAPI, PostgreSQL."},
    )
    dangling = re.compile(r"(?:,|\b(?:and|or|with|the|a|of|for|to|by|from))$")
    for payload in (match, resume, questions):
        for quote in _quotes(str(payload).replace("\\'", "'")):
            assert not dangling.search(quote.rstrip()), quote
    # The second line of the first bullet is part of what is quoted.
    assert "request latency" in str(questions)


def test_imported_skills_keep_slashed_names_whole(client, auth_headers):
    resume = WRAPPED_RESUME.replace(
        "Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS",
        "Python, FastAPI, PostgreSQL, CI/CD, UI/UX, TCP/IP",
    )
    response = client.post(f"{PREFIX}/evidence-profile/import", json={"resume_text": resume}, headers=auth_headers)
    assert response.status_code == 201, response.text
    skills = [item["content"].get("name") for item in response.json()["items"] if item["kind"] == "skill"]
    for whole in ("CI/CD", "UI/UX", "TCP/IP"):
        assert whole in skills
    for part in ("CI", "CD", "UI", "UX", "TCP", "IP"):
        assert part not in skills


# --- Item 5: exports say what the page says --------------------------------------------------


def _section(payload, section_id):
    return next(section for section in payload["exportable_sections"] if section["id"] == section_id)


def test_job_match_export_shows_the_score_out_of_100(client, auth_headers):
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": DEMO_JD})
    brief = _section(data, "brief")
    assert f"Match score: {data['match_score']}/100" in brief["items"]
    assert not any("%" in item for item in brief["items"])


def test_resume_export_snapshot_carries_the_score_and_verdict_once(client, auth_headers):
    data = _post(client, auth_headers, "/resume/analyze", {"resume_text": WRAPPED_RESUME})
    snapshot = _section(data, "overview")
    text = "\n".join([snapshot["body"] or "", *snapshot["items"]])
    verdict = data["summary"]["verdict"]
    assert f"{data['overall_score']}/100" in text
    assert data["summary"]["headline"] in text
    # The headline already opens with the verdict: it is not printed a second time.
    assert text.count(verdict) == 1
    actions = _section(data, "actions")["items"]
    rewrites = next((s["items"] for s in data["exportable_sections"] if s["id"] == "rewrite"), [])
    assert not set(actions) & set(rewrites)


def test_resume_issue_copy_is_american_english(client, auth_headers):
    resume = "\n".join(line for line in WRAPPED_RESUME.splitlines() if line != "Summary")
    resume = resume.replace("Education\nBSc Computer Science", "")
    data = _post(client, auth_headers, "/resume/analyze", {"resume_text": resume})
    assert "labelled" not in str(data)


# --- Item 6: Job Match knows the job ---------------------------------------------------------


def test_job_match_reports_the_posting_title_and_company(client, auth_headers):
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": PASTED_JD})
    assert data["job_title"] == "Senior Backend Engineer, Platform"
    assert data["company"] == "Northwind Labs"

    saved = client.get(f"{PREFIX}/history/{data['history_id']}", headers=auth_headers).json()
    assert saved["result_payload"]["job_title"] == "Senior Backend Engineer, Platform"
    assert saved["result_payload"]["company"] == "Northwind Labs"


def test_job_match_company_is_null_when_the_posting_names_none(client, auth_headers):
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": DEMO_JD})
    assert data["company"] is None
    assert data["job_title"]  # "Senior Backend Engineer (Platform)" names a role


def test_job_match_without_a_model_still_reports_title_and_company(client, auth_headers, monkeypatch):
    async def unavailable(*args, **kwargs):
        raise RuntimeError("model down")

    monkeypatch.setattr("app.services.job_matcher.complete_structured", unavailable)
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": PASTED_JD})
    assert data["job_title"] == "Senior Backend Engineer, Platform"
    assert data["company"] == "Northwind Labs"


@pytest.mark.parametrize(
    ("first_line", "title"),
    [
        ("Senior Data Engineer | Remote", "Senior Data Engineer"),
        ("Senior Data Engineer | Full-time", "Senior Data Engineer"),
        ("Data Engineer @ Berlin HQ", "Data Engineer"),
    ],
)
@pytest.mark.parametrize("model_down", [False, True])
def test_job_match_never_reports_a_work_mode_or_location_as_the_company(
    client, auth_headers, monkeypatch, first_line, title, model_down
):
    if model_down:  # the heuristic path TrackJob also prefills from

        async def unavailable(*args, **kwargs):
            raise RuntimeError("model down")

        monkeypatch.setattr("app.services.job_matcher.complete_structured", unavailable)
    jd = f"{first_line}\nWe need Python, PostgreSQL and Docker experience for our data platform."
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": jd})
    assert data["company"] is None
    assert data["job_title"] == title


def test_job_match_reads_a_company_followed_by_its_city(client, auth_headers):
    jd = "Senior Engineer at Contoso, Berlin\nWe need Python, PostgreSQL and Docker experience."
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": jd})
    assert (data["job_title"], data["company"]) == ("Senior Engineer", "Contoso")


def test_job_match_ignores_a_model_that_answers_the_word_null(client, auth_headers, monkeypatch):
    import app.services.job_matcher as job_matcher

    original = job_matcher.complete_structured

    async def says_null(*args, **kwargs):
        result = await original(*args, **kwargs)
        return {**result, "job_title": "null", "company": "Unknown"}

    monkeypatch.setattr(job_matcher, "complete_structured", says_null)
    data = _post(client, auth_headers, "/job-match/match", {"resume_text": WRAPPED_RESUME, "job_description": PASTED_JD})
    assert data["job_title"] == "Senior Backend Engineer, Platform"
    assert data["company"] == "Northwind Labs"


def test_resume_export_tolerates_a_stored_summary_with_only_a_verdict():
    from app.services.premium_outputs import attach_premium_outputs

    payload = attach_premium_outputs("resume", {"summary": {"verdict": "Needs work"}, "overall_score": 61})
    snapshot = _section(payload, "overview")
    assert "Verdict: Needs work" in snapshot["items"]
    assert "Resume score: 61/100" in snapshot["items"]


# A contact line in lower case right under the name is not a wrapped continuation of it.
CONTACT_RESUME = """Jordan Rivera
linkedin.com/in/jordan
github.com/jordan | jordan@example.com

Experience
- Built Python services used by 12 product teams and cut p95 latency by 30
  percent with query tuning.

Skills
Python, Go
kubernetes, docker
"""


def test_a_lower_case_contact_line_keeps_the_name_and_the_sign_off(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": CONTACT_RESUME, "job_description": "Backend Engineer at Contoso\nWe use Python and Go."},
    )
    assert data["full_text"].rstrip().endswith("Jordan Rivera")


def test_a_wrapped_skills_list_keeps_each_skill_separate():
    from app.services.fake_llm import _parse_resume

    resume = _parse_resume(CONTACT_RESUME)
    assert resume.name == "Jordan Rivera"
    assert resume.skills == ["Python", "Go", "kubernetes", "docker"]
    # A wrapped bullet is still joined into one quotable line.
    assert any(bullet.text.endswith("with query tuning.") for bullet in resume.bullets)


# --- Item 7: demo seed -----------------------------------------------------------------------


def _seed(db, user):
    from tests.seed_campaigns import seed_applications
    from tests.seed_discovery_listings import seed_listings

    seed_listings(db, user)
    return seed_applications(db, user)


def test_seeded_applications_show_as_added_in_discover(client, auth_headers, db, test_user):
    _seed(db, test_user)

    listings = client.get(f"{PREFIX}/discovery/listings?limit=50", headers=auth_headers).json()["items"]
    board = client.get(f"{PREFIX}/applications", headers=auth_headers).json()["items"]
    added = {(item["title"], item["company"]): item["application_id"] for item in listings if item["application_id"]}
    assert len(board) == 6
    for application in board:
        assert added.get((application["title"], application["company"])) == application["id"]


def test_seeded_activity_reads_in_a_possible_order(client, auth_headers, db, test_user):
    _seed(db, test_user)

    board = client.get(f"{PREFIX}/applications", headers=auth_headers).json()["items"]
    moved_on = [item for item in board if item["status"] in ("interviewing", "offer", "rejected")]
    assert moved_on
    for card in [item for item in board if item["applied_at"]]:
        detail = client.get(f"{PREFIX}/applications/{card['id']}", headers=auth_headers).json()
        events = sorted(detail["events"], key=lambda event: event["created_at"])
        applied = [event for event in events if event["event_type"] == "applied"]
        assert len(applied) == 1
        assert detail["applied_at"] == applied[0]["created_at"]
        assert detail["snapshot"]["created_at"] == detail["applied_at"]
        assert detail["snapshot"]["content"]["applied_at"].startswith(detail["applied_at"][:19])
        # Every move on from Applied happens after the application was sent.
        for event in events:
            if event["event_type"] == "status_changed" and event["details"].get("from") == "applied":
                assert event["created_at"] > detail["applied_at"], (card["title"], event)
        assert detail["applied_at"] <= detail["updated_at"]


def test_seed_names_the_demo_account_and_its_cv_alex_morgan(client, auth_headers, db, test_user):
    _seed(db, test_user)

    me = client.get(f"{PREFIX}/auth/me", headers=auth_headers).json()
    assert me["full_name"] == "Alex Morgan"
    documents = db.query(CvDocument).filter_by(user_id=test_user.id).all()
    assert documents
    for document in documents:
        assert document.header["name"] == "Alex Morgan"
        assert document.header["headline"]
        assert document.header["location"]


def test_fix_demo_data_repairs_an_already_seeded_account(db, test_user):
    """The one-off repair: an account seeded before B16 (no listing links, applied 'now',
    'Demo User') reads correctly after --apply, and a second run changes nothing."""
    from tests import fix_demo_data
    from tests.seed_campaigns import seed_applications
    from tests.seed_discovery_listings import seed_listings

    seed_listings(db, test_user)
    seed_applications(db, test_user)
    # Undo what the B16 seed does, to look like the old seed's output.
    now = datetime.now(UTC)
    for workspace in db.query(Workspace).filter_by(user_id=test_user.id).all():
        db.query(Workspace).filter(Workspace.id == workspace.id).update(
            {
                Workspace.discovery_listing_id: None,
                Workspace.applied_at: now if workspace.applied_at is not None else None,
                Workspace.updated_at: Workspace.updated_at,
            },
            synchronize_session=False,
        )
        for event in db.query(CampaignEvent).filter_by(workspace_id=workspace.id):
            if event.event_type == "applied" or (event.details or {}).get("to") == "applied":
                event.created_at = now
        for snapshot in db.query(ApplicationSnapshot).filter_by(workspace_id=workspace.id):
            snapshot.created_at = now
    test_user.full_name = "Demo User"
    for document in db.query(CvDocument).filter_by(user_id=test_user.id):
        document.header = {**(document.header or {}), "name": "Demo User", "headline": None, "location": None}
    db.commit()

    planned = fix_demo_data.repair(db, test_user.email, apply=False)
    assert planned  # the dry run reports what it would change, and writes none of it
    assert db.query(Workspace).filter(
        Workspace.user_id == test_user.id, Workspace.discovery_listing_id.isnot(None)
    ).count() == 0

    assert fix_demo_data.repair(db, test_user.email, apply=True)
    db.expire_all()
    workspaces = db.query(Workspace).filter_by(user_id=test_user.id).all()
    assert all(workspace.discovery_listing_id for workspace in workspaces)
    for workspace in workspaces:
        if workspace.applied_at is None:
            continue
        later = [
            event.created_at
            for event in db.query(CampaignEvent).filter_by(workspace_id=workspace.id, event_type="status_changed")
            if (event.details or {}).get("from") == "applied"
        ]
        assert all(workspace.applied_at < moved for moved in later), workspace.label
    assert db.get(type(test_user), test_user.id).full_name == "Alex Morgan"
    assert fix_demo_data.repair(db, test_user.email, apply=True) == []


# --- HANDOFF-2 §6: a quote in the cover-letter headline never stops mid-word ---------------

# 132 characters: longer than the headline's 110-character quote budget, and a plain cut at that budget lands inside "the".
LONG_FACT = (
    "Cut p95 latency on the ingestion API from 900 ms to 210 ms by redesigning the retry queue "
    "and partitioning the hot PostgreSQL tables"
)
LONG_FACT_RESUME = f"""Alex Morgan
Backend Engineer
Experience
- {LONG_FACT}.
- Mentored two engineers through their first on-call rotation.
Skills
Python, PostgreSQL, Kubernetes
"""


def test_cover_letter_headline_quotes_whole_words(client, auth_headers):
    data = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": LONG_FACT_RESUME, "job_description": "Backend Engineer at Northwind Labs\nPython and PostgreSQL."},
    )
    quote = _quotes(data["summary"]["headline"])[0]
    assert quote.endswith("…"), quote
    kept = quote[:-1]
    assert LONG_FACT.startswith(kept)
    assert LONG_FACT[len(kept)] == " ", f"cut mid-word: {quote!r}"
    assert len(kept) > 70  # a normal bullet is quoted nearly whole, not cut at the old 70 characters


# --- tool-results F24b: a "Role | City, Country" header line is a place, never the employer ------

LOCATION_HEADER_RESUME = """Alex Morgan
Senior Backend Engineer | Berlin, Germany
Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced latency by 35 percent.
- Owned PostgreSQL schema changes and incident response for 2 million events a month.
Skills
Python, FastAPI, PostgreSQL
"""


def test_a_city_and_country_is_never_quoted_as_an_employer(client, auth_headers):
    job = "Backend Engineer at Northwind Labs\nPython, FastAPI and PostgreSQL."
    letter = _post(client, auth_headers, "/cover-letter/generate", {"resume_text": LOCATION_HEADER_RESUME, "job_description": job})
    interview = _post(
        client, auth_headers, "/interview/questions", {"resume_text": LOCATION_HEADER_RESUME, "job_description": job, "num_questions": 4}
    )
    for text in (letter["full_text"], str(interview)):
        assert "At Berlin" not in text and "at Berlin" not in text
