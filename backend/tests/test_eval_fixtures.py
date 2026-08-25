"""Tests for the R8 synthetic eval fixture corpus and its loader.

Covers the acceptance criteria of issue #119: the committed corpus has 10-12
fixtures matching the schema, every fixture is a synthetic/PII-free case, and a
loader reads them into typed objects. Discipline/seniority coverage is asserted
against the real ``quality_signals`` inference the eval harness will use.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.evals import EvalFixture, load_fixtures
from app.evals.calibration import CALIBRATION_THRESHOLD, is_calibration_miss
from app.evals.loader import FIXTURES_DIR, FixtureError
from app.services import quality_signals as qs

REQUIRED_DISCIPLINES = {
    "backend-engineering",
    "frontend-engineering",
    "data-analytics",
    "product-design",
    "product-management",
}

# Contact-PII shapes a hand-authored synthetic resume should never contain.
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{8,}\d)")


def test_loader_returns_expected_count() -> None:
    # Acceptance criterion (#119): the corpus holds 10-12 fixtures; it ships 11.
    fixtures = load_fixtures()
    assert len(fixtures) == 11


def test_loader_returns_typed_fixtures_matching_schema() -> None:
    for fixture in load_fixtures():
        assert isinstance(fixture, EvalFixture)
        assert isinstance(fixture.id, str) and fixture.id
        assert isinstance(fixture.resume_text, str) and fixture.resume_text.strip()
        assert fixture.job_description is None or (
            isinstance(fixture.job_description, str) and fixture.job_description.strip()
        )
        assert isinstance(fixture.notes, str) and fixture.notes.strip()

        for band in (fixture.expected_score_band, fixture.expected_match_band):
            assert isinstance(band, tuple) and len(band) == 2
            low, high = band
            assert isinstance(low, int) and isinstance(high, int)
            assert 0 <= low <= high <= 100


def test_fixture_ids_are_unique_and_match_filenames() -> None:
    fixtures = load_fixtures()
    ids = [fixture.id for fixture in fixtures]
    assert len(ids) == len(set(ids))

    file_stems = {path.stem for path in FIXTURES_DIR.glob("*.json")}
    assert set(ids) == file_stems


def test_every_fixture_is_pii_free_synthetic_text() -> None:
    """Synthetic fixtures carry no email/phone contact PII (ADR 0002 intent)."""
    for fixture in load_fixtures():
        blob = fixture.resume_text + "\n" + (fixture.job_description or "")
        assert not EMAIL_RE.search(blob), f"{fixture.id}: unexpected email-shaped text"
        assert not PHONE_RE.search(blob), f"{fixture.id}: unexpected phone-shaped text"


def test_corpus_covers_all_disciplines_and_required_seniorities() -> None:
    disciplines: set[str] = set()
    seniorities: set[str] = set()
    no_jd_count = 0

    for fixture in load_fixtures():
        skills = qs.extract_detected_skills(fixture.resume_text)
        disciplines.add(qs.infer_resume_discipline(fixture.resume_text, skills))
        seniorities.add(qs.infer_resume_seniority(fixture.resume_text))
        if fixture.job_description is None:
            no_jd_count += 1

    assert REQUIRED_DISCIPLINES <= disciplines
    assert "entry" in seniorities
    assert "senior" in seniorities
    assert no_jd_count >= 1


def test_expected_bands_sit_on_the_scale_the_check_measures() -> None:
    """Corpus-authoring guard: each band must sit on its own tool's scale.

    The calibration check (D-042) scores fixtures with the heuristic-only
    scorers, and the two tools are on different scales: Resume Analyzer is the
    mean of five floored dimensions, so a complete resume lands in the 70s-90s;
    Job Match is keyword overlap with the JD, 25 at zero overlap and 100 at full.
    A band authored against some other scale flags its fixture on every run
    regardless of tool quality — the corpus originally held blended-scale bands
    and reused the resume band for Job Match, which is how #118's three standing
    misses got in. So assert each band brackets the score its own check produces,
    inside the calibration tolerance.
    """
    for fixture in load_fixtures():
        prepass = qs.build_resume_prepass(fixture.resume_text, fixture.job_description)
        resume_overall = qs.compute_overall_score(qs.compute_resume_breakdown(prepass))
        assert not is_calibration_miss(resume_overall, fixture.expected_score_band), (
            f"{fixture.id}: resume score {resume_overall} falls outside "
            f"expected_score_band {fixture.expected_score_band} by more than "
            f"{CALIBRATION_THRESHOLD} points"
        )

        if fixture.job_description is None:
            continue
        match = qs.compute_match_score(
            prepass.matched_keywords, prepass.missing_keywords
        )
        assert not is_calibration_miss(match, fixture.expected_match_band), (
            f"{fixture.id}: match score {match} falls outside expected_match_band "
            f"{fixture.expected_match_band} by more than {CALIBRATION_THRESHOLD} points"
        )


def test_only_jd_fixtures_carry_an_explicit_match_band() -> None:
    """Job Match is skipped without a JD, so only JD fixtures pin its band."""
    for fixture in load_fixtures():
        raw = json.loads(
            (FIXTURES_DIR / f"{fixture.id}.json").read_text(encoding="utf-8")
        )
        has_band = "expected_match_band" in raw
        assert has_band == (fixture.job_description is not None), (
            f"{fixture.id}: expected_match_band should be present only when the "
            f"fixture carries a job description"
        )


def _write_fixture(directory: Path, name: str, payload: dict | str) -> None:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    (directory / name).write_text(text, encoding="utf-8")


def _valid_payload(fixture_id: str) -> dict:
    return {
        "id": fixture_id,
        "resume_text": "Summary\nSynthetic resume body.",
        "job_description": None,
        "expected_score_band": [40, 60],
        "notes": "synthetic test fixture",
    }


def test_loader_loads_a_temp_directory(tmp_path: Path) -> None:
    _write_fixture(tmp_path, "sample-a.json", _valid_payload("sample-a"))
    _write_fixture(tmp_path, "sample-b.json", _valid_payload("sample-b"))
    fixtures = load_fixtures(tmp_path)
    assert [f.id for f in fixtures] == ["sample-a", "sample-b"]


def test_loader_raises_on_empty_directory(tmp_path: Path) -> None:
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_loader_raises_on_missing_directory(tmp_path: Path) -> None:
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path / "does-not-exist")


def test_loader_raises_when_id_does_not_match_filename(tmp_path: Path) -> None:
    _write_fixture(tmp_path, "mismatch.json", _valid_payload("other-id"))
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_loader_raises_on_missing_field(tmp_path: Path) -> None:
    payload = _valid_payload("sample")
    del payload["notes"]
    _write_fixture(tmp_path, "sample.json", payload)
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_loader_raises_on_unknown_field(tmp_path: Path) -> None:
    payload = _valid_payload("sample")
    payload["extra"] = "nope"
    _write_fixture(tmp_path, "sample.json", payload)
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


@pytest.mark.parametrize("band", [[60, 40], [-1, 50], [50, 101], [50], [50, 60, 70], "50-60"])
def test_loader_raises_on_bad_score_band(tmp_path: Path, band: object) -> None:
    payload = _valid_payload("sample")
    payload["expected_score_band"] = band
    _write_fixture(tmp_path, "sample.json", payload)
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_match_band_defaults_to_the_score_band(tmp_path: Path) -> None:
    """Fixtures authored before Job Match got its own scale still load (#118)."""
    _write_fixture(tmp_path, "sample.json", _valid_payload("sample"))
    (fixture,) = load_fixtures(tmp_path)
    assert fixture.expected_score_band == (40, 60)
    assert fixture.expected_match_band == (40, 60)


def test_match_band_is_read_independently_of_the_score_band(tmp_path: Path) -> None:
    payload = _valid_payload("sample")
    payload["expected_match_band"] = [80, 100]
    _write_fixture(tmp_path, "sample.json", payload)
    (fixture,) = load_fixtures(tmp_path)
    assert fixture.expected_score_band == (40, 60)
    assert fixture.expected_match_band == (80, 100)


@pytest.mark.parametrize("band", [[100, 80], [-1, 50], [50, 101], [50], "80-100"])
def test_loader_raises_on_bad_match_band(tmp_path: Path, band: object) -> None:
    payload = _valid_payload("sample")
    payload["expected_match_band"] = band
    _write_fixture(tmp_path, "sample.json", payload)
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_loader_raises_on_invalid_json(tmp_path: Path) -> None:
    _write_fixture(tmp_path, "sample.json", "{not json")
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)


def test_loader_raises_on_empty_resume_text(tmp_path: Path) -> None:
    payload = _valid_payload("sample")
    payload["resume_text"] = "   "
    _write_fixture(tmp_path, "sample.json", payload)
    with pytest.raises(FixtureError):
        load_fixtures(tmp_path)
