from app.services.cv_quality import score_cv_quality

PREFIX = "/api/v1/cv-documents"


def _section(kind, title, entries, position):
    return {
        "id": f"section-{kind}",
        "kind": kind,
        "title": title,
        "visible": True,
        "position": position,
        "entries": [
            {"id": f"{kind}-{i}", "evidence_item_id": None, "body": body, "position": i}
            for i, body in enumerate(entries)
        ],
    }


def test_hand_authored_strong_synthetic_fixture_lands_in_expected_bands():
    sections = [
        _section(
            "summary", "Summary", ["Platform engineer building reliable accessible services."], 0
        ),
        _section(
            "experience",
            "Experience",
            [
                "Reduced synthetic processing time by 34% for 12 internal teams.",
                "Built an accessible workflow used by 1,800 test accounts.",
                "Improved release reliability from 91% to 98% in a sandbox.",
            ],
            1,
        ),
        _section("skills", "Skills", ["Python, TypeScript, PostgreSQL, AWS, accessibility"], 2),
        _section("education", "Education", ["Synthetic Institute — BSc Computer Science"], 3),
    ]
    scores = {item["key"]: item["score"] for item in score_cv_quality(sections)}
    assert 75 <= scores["impact"] <= 100
    assert 70 <= scores["structure"] <= 100
    assert 65 <= scores["completeness"] <= 100
    assert 65 <= scores["clarity"] <= 100


def test_hand_authored_thin_synthetic_fixture_lands_in_low_bands():
    scores = {
        item["key"]: item["score"]
        for item in score_cv_quality([_section("custom", "About", ["Worked on things."], 0)])
    }
    assert 0 <= scores["impact"] <= 45
    assert 0 <= scores["structure"] <= 45
    assert 0 <= scores["completeness"] <= 45
    assert 0 <= scores["clarity"] <= 45


def _clean_sections():
    return [
        _section("summary", "Summary", ["Platform engineer building reliable services."], 0),
        _section(
            "experience",
            "Experience",
            ["Reduced processing time by 34% for 12 teams. See https://example.com/work"],
            1,
        ),
        _section("skills", "Skills", ["Python, TypeScript, PostgreSQL"], 2),
    ]


def _check(client, auth_headers, sections, style=None):
    document = client.post(
        PREFIX, json={"name": "Checklist CV", "sections": sections}, headers=auth_headers
    ).json()
    if style is not None:
        client.patch(f"{PREFIX}/{document['id']}", json={"style": style}, headers=auth_headers)
    response = client.post(f"{PREFIX}/{document['id']}/quality", headers=auth_headers)
    assert response.status_code == 200
    return response.json()


def test_clean_cv_passes_every_check_and_exposes_no_score(client, auth_headers):
    payload = _check(client, auth_headers, _clean_sections())

    assert payload["schema_version"] == "cv-quality/v2"
    assert [c["id"] for c in payload["checks"]] == [
        "sections",
        "reads_back",
        "links",
        "page_breaks",
        "layout",
    ]
    assert all(c["passed"] for c in payload["checks"])
    assert all(c["label"] and c["detail"] and c["fix"] for c in payload["checks"])
    # CONTEXT.md: never a universal ATS score, and no LLM second opinion.
    for removed in ("ats_score", "ats_fixes", "ats_checks", "scoring_mode", "remaining_model_runs"):
        assert removed not in payload
    assert all("score" not in check and "status" not in check for check in payload["checks"])


def test_cv_with_known_problems_fails_exactly_those_checks(client, auth_headers):
    no_standard_sections = [_section("custom", "About", ["Worked on things."], 0)]
    payload = _check(
        client,
        auth_headers,
        no_standard_sections,
        style={"template_id": "modern-two-column", "ats_mode": False},
    )

    failed = {c["id"] for c in payload["checks"] if not c["passed"]}
    # No Experience/Skills sections, and a two-column PDF that reads back out
    # of order; links and page breaks are still fine.
    assert failed == {"sections", "reads_back", "layout"}
    assert all(c["fix"] for c in payload["checks"] if not c["passed"])


def test_ats_mode_clears_the_two_column_layout_failure(client, auth_headers):
    payload = _check(
        client,
        auth_headers,
        _clean_sections(),
        style={"template_id": "modern-two-column", "ats_mode": True},
    )

    assert all(c["passed"] for c in payload["checks"])
