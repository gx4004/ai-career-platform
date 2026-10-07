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

    assert payload["schema_version"] == "cv-quality/v3"
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
    # Nor the deterministic 0-100 writing-quality numbers the studio no longer shows.
    for removed in (
        "ats_score",
        "ats_fixes",
        "ats_checks",
        "scoring_mode",
        "remaining_model_runs",
        "dimensions",
        "advisory_note",
    ):
        assert removed not in payload
    assert all("score" not in check and "status" not in check for check in payload["checks"])


def test_cv_with_known_problems_fails_exactly_those_checks(client, auth_headers):
    # No Experience section; Skills sits in the two-column sidebar, which the PDF
    # reads before the main column, so it comes back ahead of the Summary.
    sidebar_before_main = [
        _section("summary", "Summary", ["Worked on things."], 0),
        _section("skills", "Skills", ["Python"], 1),
    ]
    payload = _check(
        client,
        auth_headers,
        sidebar_before_main,
        style={"template_id": "modern-two-column", "ats_mode": False},
    )

    failed = {c["id"] for c in payload["checks"] if not c["passed"]}
    # No Experience/Skills sections, and a two-column style (the "layout" check). The
    # PDF itself reads back in order now: until T6 (T6) the legacy two-column id
    # prints as the single-column `classic`, so there is no sidebar to read first.
    assert failed == {"sections", "layout"}
    assert all(c["fix"] for c in payload["checks"] if not c["passed"])


def test_ats_mode_clears_the_two_column_layout_failure(client, auth_headers):
    payload = _check(
        client,
        auth_headers,
        _clean_sections(),
        style={"template_id": "modern-two-column", "ats_mode": True},
    )

    assert all(c["passed"] for c in payload["checks"])
