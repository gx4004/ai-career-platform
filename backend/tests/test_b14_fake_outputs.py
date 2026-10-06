"""B14: fake-provider outputs stay grounded in the input (live re-verification, 2026-10-06).

Every test drives the real tool route with ``LLM_PROVIDER=fake``, so what is asserted
is what a person running the app locally sees.
"""

from __future__ import annotations

import fitz
import pytest

from app.config import settings
from app.schemas.tools import CoverLetterEditRequest
from app.services.cover_letter_edits import apply_letter_edit
from app.services.quality_signals import keyword_present
from app.services.result_cache import clear_cache

PREFIX = "/api/v1"

CONTACT_RESUME = (
    "Jordan Rivera\n"
    "Senior Backend Engineer | jordan.rivera@example.com | Austin, TX\n"
    "Professional Summary\n"
    "Backend engineer with 8 years of experience building Python services.\n"
    "Experience\n"
    "- Reduced API latency by 40% by redesigning the caching layer.\n"
    "- Led a team of 4 engineers to ship the billing platform.\n"
    "Skills\n"
    "Python, SQL, Docker, Kubernetes\n"
    "Education\n"
    "BS Computer Science\n"
)
BACKEND_JD = (
    "Backend Engineer at Contoso\n"
    "We need Python, SQL and Kubernetes experience to build reliable APIs."
)


@pytest.fixture(autouse=True)
def _fake_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")
    clear_cache()
    yield
    clear_cache()


def _post(client, headers, path, body):
    response = client.post(f"{PREFIX}{path}", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# --- Item 1: a contact header is never an employer ----------------------------------------


@pytest.mark.parametrize(
    "header",
    [
        "Senior Backend Engineer | jordan.rivera@example.com | Austin, TX",
        "Senior Backend Engineer | (512) 555-0134 | Austin, TX",
        "Senior Backend Engineer | linkedin.com/in/jordanrivera",
        "Senior Backend Engineer | Austin, TX",
    ],
)
def test_cover_letter_never_names_a_contact_line_as_the_employer(client, auth_headers, header):
    resume = CONTACT_RESUME.replace(
        "Senior Backend Engineer | jordan.rivera@example.com | Austin, TX", header
    )
    data = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": resume, "job_description": BACKEND_JD},
    )

    text = data["full_text"]
    for leaked in ("example.com", "555-0134", "linkedin.com", "At Austin", "Austin, TX"):
        assert leaked not in text


def test_interview_and_job_match_do_not_cite_contact_details_as_a_workplace(client, auth_headers):
    interview = _post(
        client,
        auth_headers,
        "/interview/questions",
        {"resume_text": CONTACT_RESUME, "job_description": BACKEND_JD},
    )
    match = _post(
        client,
        auth_headers,
        "/job-match/match",
        {"resume_text": CONTACT_RESUME, "job_description": BACKEND_JD},
    )

    blob = str(interview) + str(match)
    assert "jordan.rivera@example.com" not in blob
    assert "Austin, TX" not in blob


def test_a_real_role_line_still_names_the_employer(client, auth_headers):
    resume = CONTACT_RESUME.replace("Experience\n", "Experience\nSenior Backend Engineer | Northwind Logistics | 2019-2024\n")
    data = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": resume, "job_description": BACKEND_JD},
    )

    assert "At Northwind Logistics, " in data["full_text"]
    assert "example.com" not in data["full_text"]


# --- Item 2: Career Path gaps never contradict the resume ---------------------------------

DESIGNER_RESUME = (
    "Avery Chen\n"
    "Senior Product Designer\n"
    "Summary\n"
    "Product designer with 7 years of experience in UX research, design systems and accessibility.\n"
    "Experience\n"
    "Senior Product Designer at Lumen Health\n"
    "- Ran UX research with 40 patients to redesign the booking flow, lifting completion by 22%.\n"
    "- Built and documented the Figma design systems library used by 6 product teams.\n"
    "- Led an accessibility audit that brought the app to WCAG 2.1 AA.\n"
    "- Told the redesign story through a case study and storytelling workshops for leadership.\n"
    "Skills\n"
    "Figma, User Research, Design Systems, Accessibility, Prototyping, Storytelling\n"
    "Education\n"
    "BA Interaction Design\n"
)
DEMONSTRATED = ("user research", "design systems", "accessibility", "figma", "prototyping", "storytelling")


def _career(client, headers, resume, target):
    return _post(client, headers, "/career/recommend", {"resume_text": resume, "target_role": target})


def test_career_gaps_never_list_a_skill_the_resume_demonstrates(client, auth_headers):
    data = _career(client, auth_headers, DESIGNER_RESUME, "Lead Product Designer")

    gap_names = [gap["skill"].lower() for gap in data["skill_gaps"]]
    gap_names += [skill.lower() for skill in data["target_skills"]]
    for path in data["paths"]:
        gap_names += [gap.lower() for gap in path["gaps_to_close"]]
    assert gap_names, "there should still be real gaps to close"
    for shown in DEMONSTRATED:
        assert shown not in gap_names, f"{shown} is demonstrated on the resume but listed as a gap"
    assert data["skill_gaps"]


def test_career_gap_reasons_cite_only_strengths_the_resume_shows(client, auth_headers):
    data = _career(client, auth_headers, DESIGNER_RESUME, "Lead Product Designer")

    for path in data["paths"]:
        for strength in path["strengths_to_leverage"]:
            # every claimed strength appears (as a word or its family) on the resume
            assert keyword_present(strength, DESIGNER_RESUME), strength
    for gap in data["skill_gaps"]:
        assert "your resume shows related work but" not in gap["why_it_matters"]


def test_backend_resume_gaps_drop_what_it_already_shows(client, auth_headers):
    resume = (
        "Sam Ortiz\nBackend Engineer\nExperience\n"
        "- Built Python APIs on SQL and wrote pytest testing suites for 12 services.\n"
        "- Set up monitoring and alerting and CI/CD with GitHub Actions.\n"
        "- Led a team of 3 engineers.\n"
        "Skills\nPython, SQL, Testing, CI/CD, Docker\nEducation\nBS CS\n"
    )
    data = _career(client, auth_headers, resume, "Senior Backend Engineer")

    names = {gap["skill"].lower() for gap in data["skill_gaps"]} | {s.lower() for s in data["target_skills"]}
    assert not names & {"testing", "ci/cd", "observability", "leadership", "python", "sql"}


# --- Item 3: a wrong-field resume never scores as a strong match --------------------------

CHEF_JD = (
    "Sous Chef\n"
    "We are hiring a Sous Chef to manage prep, food cost control, HACCP safety, menu development "
    "and team leadership in a busy kitchen."
)
BACKEND_RESUME = (
    "Sam Ortiz\nBackend Engineer\nSummary\nBackend engineer with 6 years of experience.\nExperience\n"
    "- Built Python APIs on PostgreSQL serving 2 million requests a day.\n"
    "- Led a team of 4 engineers through a database migration.\n"
    "Skills\nPython, SQL, Docker, Kubernetes\nEducation\nBS Computer Science\n"
)
CHEF_RESUME = (
    "Maria Lopez\nSous Chef\nSummary\nSous chef with 8 years in high-volume kitchens.\nExperience\n"
    "- Ran daily prep for a 180-cover restaurant and trained 6 line cooks.\n"
    "- Led menu development for two seasonal tasting menus.\n"
    "- Kept HACCP safety logs and passed every inspection for 3 years.\n"
    "- Cut food cost by 6% through food cost control and supplier renegotiation.\n"
    "- Led a team of 9 kitchen staff across two shifts.\n"
    "Skills\nMenu development, HACCP, Food cost control, Team leadership\nEducation\nCulinary Arts Diploma\n"
)


def _job_match(client, headers, resume, jd):
    return _post(client, headers, "/job-match/match", {"resume_text": resume, "job_description": jd})


def test_backend_resume_is_not_a_strong_match_for_a_chef_posting(client, auth_headers):
    wrong = _job_match(client, auth_headers, BACKEND_RESUME, CHEF_JD)
    right = _job_match(client, auth_headers, CHEF_RESUME, CHEF_JD)

    assert wrong["verdict"] != "strong"
    assert wrong["match_score"] < 78
    assert right["match_score"] > wrong["match_score"]
    assert right["verdict"] == "strong"
    # the posting's own non-tech requirements are what is checked
    keywords = {k.lower() for k in wrong["matched_keywords"]} | {m["keyword"].lower() for m in wrong["missing_keywords"]}
    assert "haccp" in keywords
    assert any("menu" in k for k in keywords)


def test_a_posting_with_almost_nothing_checkable_is_capped_and_says_so(client, auth_headers):
    jd = "Team Member\nJoin our friendly crew. Leadership welcome. Apply today and grow with us!"
    data = _job_match(client, auth_headers, BACKEND_RESUME, jd)

    assert data["verdict"] != "strong"
    assert data["match_score"] < 78
    assert "low confidence" in data["summary"]["confidence_note"].lower()


def test_resume_analyzer_keyword_score_reflects_a_wrong_field_posting(client, auth_headers):
    wrong = _post(client, auth_headers, "/resume/analyze", {"resume_text": BACKEND_RESUME, "job_description": CHEF_JD})
    right = _post(client, auth_headers, "/resume/analyze", {"resume_text": CHEF_RESUME, "job_description": CHEF_JD})

    def keyword_score(data):
        return next(item["score"] for item in data["score_breakdown"] if item["key"] == "keywords")

    assert keyword_score(right) > keyword_score(wrong)


# --- Item 7: the sign-off is part of the letter, through edits and every export -----------


def _pdf_text(blob: bytes) -> str:
    doc = fitz.open(stream=blob, filetype="pdf")
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


def test_the_sign_off_survives_an_edit_and_reaches_the_pdf(client, auth_headers):
    letter = _post(
        client,
        auth_headers,
        "/cover-letter/generate",
        {"resume_text": CONTACT_RESUME, "job_description": BACKEND_JD},
    )
    assert letter["sign_off"] == "Sincerely,\nJordan Rivera"
    assert letter["full_text"].endswith("Sincerely,\nJordan Rivera")

    edit = client.patch(
        f"{PREFIX}/history/{letter['history_id']}/letter",
        json={
            "opening": "Dear Contoso team,\n\nI am applying for the Backend Engineer role.",
            "body_points": [point["text"] + " Edited." for point in letter["body_points"]],
            "closing": "Thank you for reading.",
        },
        headers=auth_headers,
    )
    assert edit.status_code == 200, edit.text
    assert edit.json()["full_text"].endswith("Thank you for reading.\n\nSincerely,\nJordan Rivera")

    stored = client.get(f"{PREFIX}/history/{letter['history_id']}", headers=auth_headers).json()
    assert stored["result_payload"]["sign_off"] == "Sincerely,\nJordan Rivera"

    pdf = client.get(f"{PREFIX}/history/{letter['history_id']}/export/pdf", headers=auth_headers)
    assert pdf.status_code == 200
    text = _pdf_text(pdf.content)
    assert "Thank you for reading." in text
    assert "Sincerely," in text and "Jordan Rivera" in text
    assert text.index("Thank you for reading.") < text.index("Sincerely,")


def test_a_letter_without_a_known_name_has_no_invented_sign_off(client, auth_headers):
    resume = CONTACT_RESUME.replace("Jordan Rivera\n", "")
    letter = _post(client, auth_headers, "/cover-letter/generate", {"resume_text": resume, "job_description": BACKEND_JD})

    assert letter["sign_off"] == ""
    assert "Sincerely" not in letter["full_text"]


def test_an_older_run_whose_sign_off_lives_only_in_full_text_keeps_it_on_edit():

    payload = {
        "opening": {"text": "Dear team,"},
        "body_points": [{"text": "I built things."}],
        "closing": {"text": "Thanks."},
        "full_text": "Dear team,\n\nI built things.\n\nThanks.\n\nSincerely,\nAva Stone",
    }

    edited = apply_letter_edit(
        payload, CoverLetterEditRequest(opening="Hello team,", body_points=["I built more."], closing="Thanks again.")
    )

    assert edited["full_text"] == "Hello team,\n\nI built more.\n\nThanks again.\n\nSincerely,\nAva Stone"
    assert edited["sign_off"] == "Sincerely,\nAva Stone"


# --- Item 9: the company is named when the posting names it, and claims stay true ---------

PLAIN_RESUME = CONTACT_RESUME.replace("Senior Backend Engineer | jordan.rivera@example.com | Austin, TX\n", "")


@pytest.mark.parametrize(
    "jd",
    [
        "We're hiring a Backend Engineer at Contoso to build reliable Python and SQL APIs on Kubernetes.",
        "Contoso is hiring a Backend Engineer.\nYou will build reliable Python and SQL APIs on Kubernetes.",
        "Backend Engineer\nAbout Contoso\nContoso builds logistics software. You will build Python and SQL APIs on Kubernetes.",
    ],
)
def test_cover_letter_names_the_company_from_common_posting_patterns(client, auth_headers, jd):
    letter = _post(client, auth_headers, "/cover-letter/generate", {"resume_text": PLAIN_RESUME, "job_description": jd})

    assert letter["opening"]["text"].startswith("Dear Contoso hiring team,")
    assert "Contoso" in letter["closing"]["text"] or "Contoso" in letter["opening"]["text"].split("\n", 2)[-1]


def test_rationale_does_not_claim_a_company_the_letter_never_names(client, auth_headers):
    jd = "Backend Engineer\nWe need Python, SQL and Kubernetes experience to build reliable APIs."
    letter = _post(client, auth_headers, "/cover-letter/generate", {"resume_text": PLAIN_RESUME, "job_description": jd})

    assert "Dear Hiring Manager," in letter["opening"]["text"]
    assert "company" not in letter["opening"]["why_this_paragraph"].lower()


def test_a_single_missing_keyword_reads_in_the_singular(client, auth_headers):
    resume = PLAIN_RESUME.replace(", Kubernetes", "")
    jd = "Backend Engineer\nWe need Python, SQL and Kubernetes experience."
    match = _post(client, auth_headers, "/job-match/match", {"resume_text": resume, "job_description": jd})

    headline = match["summary"]["headline"]
    assert "Kubernetes" in headline
    assert "Kubernetes still need " not in headline and "Kubernetes are " not in headline


def test_an_inferred_match_is_quoted_not_claimed_as_listed(client, auth_headers):
    resume = (
        "Sam Ortiz\nExperience\n- Led a team of 4 engineers through a database migration.\n"
        "- Built Python APIs serving 2 million requests a day.\nSkills\nPython, SQL\nEducation\nBS CS\n"
    )
    jd = "Backend Engineer\nWe need Python, SQL and leadership."
    match = _post(client, auth_headers, "/job-match/match", {"resume_text": resume, "job_description": jd})

    leadership = next(r for r in match["requirements"] if r["requirement"].lower() == "leadership")
    assert leadership["status"] == "matched"
    assert "listed" not in leadership["resume_evidence"]
    assert "Led a team of 4 engineers" in leadership["resume_evidence"]


# --- Item 8: Re-generate feedback visibly changes every tool's fake result ----------------

FEEDBACK_RESUME = (
    "Jordan Rivera\nSenior Backend Engineer\nSummary\nBackend engineer with 8 years of experience building Python services.\n"
    "Experience\nSenior Backend Engineer at Northwind Logistics\n"
    "- Reduced API latency by 40% by redesigning the caching layer.\n"
    "- Mentored 3 junior engineers and led the weekly design review.\n"
    "- Migrated 12 services to Kubernetes with zero downtime.\n"
    "- Wrote the on-call runbook used by 4 teams.\n"
    "Skills\nPython, SQL, Docker, Kubernetes\nEducation\nBS Computer Science\n"
)
FEEDBACK_JD = "Backend Engineer at Contoso\nWe need Python, SQL, Kubernetes, Terraform, leadership and system design."

TOOLS = {
    "resume": ("/resume/analyze", {"resume_text": FEEDBACK_RESUME, "job_description": FEEDBACK_JD}),
    "job-match": ("/job-match/match", {"resume_text": FEEDBACK_RESUME, "job_description": FEEDBACK_JD}),
    "career": ("/career/recommend", {"resume_text": FEEDBACK_RESUME, "target_role": "Staff Backend Engineer"}),
    "interview": ("/interview/questions", {"resume_text": FEEDBACK_RESUME, "job_description": FEEDBACK_JD}),
    "portfolio": ("/portfolio/recommend", {"resume_text": FEEDBACK_RESUME, "target_role": "Staff Backend Engineer"}),
}
# What a reader scans first on each result page.
LEAD_ITEMS = {
    "resume": lambda d: [d["top_actions"][0], d["strengths"][0]],
    "job-match": lambda d: [d["top_actions"][0]],
    "career": lambda d: [d["top_actions"][0]],
    "interview": lambda d: [d["questions"][0]],
    "portfolio": lambda d: [d["top_actions"][0]],
}


def _volume(data: dict) -> int:
    """Characters of advice a reader has to get through, excluding the envelope."""
    skip = {"history_id", "generated_at", "summary", "schema_version", "download_title", "exportable_sections"}
    return len(str({k: v for k, v in data.items() if k not in skip}))


@pytest.mark.parametrize("tool", list(TOOLS))
def test_concise_feedback_makes_the_result_shorter(client, auth_headers, tool):
    path, body = TOOLS[tool]
    baseline = _post(client, auth_headers, path, body)
    concise = _post(client, auth_headers, path, {**body, "feedback": "Too long. Make it more concise."})

    assert _volume(concise) < 0.85 * _volume(baseline)


@pytest.mark.parametrize("tool", list(TOOLS))
def test_focus_feedback_puts_that_topic_first(client, auth_headers, tool):
    path, body = TOOLS[tool]
    baseline = _post(client, auth_headers, path, body)
    focused = _post(client, auth_headers, path, {**body, "feedback": "Please focus on leadership."})

    lead = " ".join(str(item) for item in LEAD_ITEMS[tool](focused)).lower()
    assert "leadership" in lead
    assert LEAD_ITEMS[tool](focused) != LEAD_ITEMS[tool](baseline)


# --- Fixer follow-ups (review of B14) ------------------------------------------------------


def test_concise_job_match_keeps_every_gap(client, auth_headers):
    path, body = TOOLS["job-match"]
    baseline = _post(client, auth_headers, path, body)
    concise = _post(
        client, auth_headers, path, {**body, "feedback": "Make it more concise and focus on mentoring."}
    )

    assert any(r["status"] == "missing" for r in concise["requirements"])
    assert {m["keyword"] for m in concise["missing_keywords"]} == {
        m["keyword"] for m in baseline["missing_keywords"]
    }


def test_job_match_evidence_never_quotes_the_contact_header(client, auth_headers):
    resume = (
        "Sam Okafor\nPlatform Engineer | sam@okafor.dev | (303) 555-0199 | Denver, CO\n"
        "Experience\n- Ran the Go services behind the payments API for 3 teams.\n"
        "Skills\nGo, Kubernetes\nEducation\nBS CS\n"
    )
    jd = "Platform Engineer\nWe need platform engineering experience with Go and Kubernetes."
    match = _job_match(client, auth_headers, resume, jd)

    for requirement in match["requirements"]:
        for leaked in ("okafor.dev", "555-0199", "Denver"):
            assert leaked not in requirement["resume_evidence"]


def test_a_previous_employer_in_the_posting_is_not_the_hiring_company(client, auth_headers):
    jd = (
        "Backend Engineer\nWe're hiring engineers who have worked at Google or Meta on Go and Kubernetes platforms."
    )
    letter = _post(client, auth_headers, "/cover-letter/generate", {"resume_text": PLAIN_RESUME, "job_description": jd})

    assert letter["opening"]["text"].startswith("Dear Hiring Manager,")
    assert "Google" not in letter["full_text"]  # neither the employer nor a "requirement"


def test_a_capped_match_with_nothing_missing_does_not_claim_remaining_gaps(client, auth_headers):
    match = _job_match(client, auth_headers, BACKEND_RESUME, "Backend Engineer\nWe need strong Python skills.")

    headline = match["summary"]["headline"]
    assert match["verdict"] == "borderline"
    assert "remaining requirements" not in headline
    assert "1 of 1 requirements" not in headline
    assert "full posting" in headline


def test_a_posting_with_no_checkable_requirement_says_so(client, auth_headers):
    jd = "Team Member\nJoin our friendly crew. Apply today and grow with us!"
    match = _job_match(client, auth_headers, BACKEND_RESUME, jd)

    assert match["summary"]["confidence_note"].lower().startswith("low confidence")
    assert "0 of 0" not in match["summary"]["headline"]
    assert "remaining requirements" not in match["summary"]["headline"]


@pytest.mark.parametrize("path", ["/career/recommend", "/portfolio/recommend"])
def test_an_acronym_in_the_target_role_is_not_cited_as_a_strength(client, auth_headers, path):
    data = _post(client, auth_headers, path, {"resume_text": BACKEND_RESUME, "target_role": "QA Engineer (SDET)"})

    for strength in data.get("strengths_to_leverage") or []:
        assert "SDET" not in str(strength)
