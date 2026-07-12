import pytest

from app.services.cv_quality import analyze_cv_quality, score_cv_quality


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


@pytest.mark.asyncio
async def test_blended_path_keeps_every_synthetic_dimension_in_expected_band(monkeypatch):
    sections = [
        _section("summary", "Summary", ["Engineer focused on reliable systems."], 0),
        _section("experience", "Experience", ["Reduced test latency by 28% across 8 services."], 1),
        _section("skills", "Skills", ["Python, SQL, AWS, TypeScript"], 2),
        _section("education", "Education", ["Synthetic University"], 3),
    ]

    async def complete(*_):
        return {
            "scores": [
                {"key": "impact", "score": 80},
                {"key": "clarity", "score": 76},
                {"key": "completeness", "score": 82},
                {"key": "structure", "score": 84},
            ]
        }

    monkeypatch.setattr("app.services.cv_quality.complete_structured", complete)
    result = await analyze_cv_quality("Synthetic CV", sections=sections)
    scores = {item["key"]: item["score"] for item in result["dimensions"]}
    assert result["scoring_mode"] == "blended"
    assert all(
        60 <= scores[key] <= 90 for key in ("impact", "clarity", "completeness", "structure")
    )


@pytest.mark.asyncio
async def test_incomplete_model_scores_fall_back_to_explainable_heuristics(monkeypatch):
    sections = [_section("custom", "About", ["Worked on things."], 0)]

    async def incomplete(*_):
        return {"scores": [{"key": "impact", "score": 99}]}

    monkeypatch.setattr("app.services.cv_quality.complete_structured", incomplete)
    result = await analyze_cv_quality("Synthetic CV", sections=sections)
    assert result["scoring_mode"] == "heuristic"
    assert len(result["dimensions"]) == 4
    assert all(item["reasons"] and item["remediation"] for item in result["dimensions"])
