from app.services.cv_quality import score_cv_quality


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


def test_hand_authored_thin_synthetic_fixture_lands_in_low_bands():
    scores = {
        item["key"]: item["score"]
        for item in score_cv_quality([_section("custom", "About", ["Worked on things."], 0)])
    }
    assert 0 <= scores["impact"] <= 45
    assert 0 <= scores["structure"] <= 45
    assert 0 <= scores["completeness"] <= 45
