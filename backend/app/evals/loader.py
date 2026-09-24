"""Loader for the R8 synthetic eval fixture corpus.

Reads every ``*.json`` file under ``fixtures/`` into a validated, typed
:class:`EvalFixture`. The corpus is hand-authored and fully synthetic (D-041,
ADR 0002); this loader is the single entry point every eval consumer
(calibration check, fabrication check, CLI runner) uses to read it, so schema
enforcement lives here rather than being duplicated per consumer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"

#: Keys every fixture JSON object must define. ``job_description`` may be
#: ``null`` (the no-JD case) but the key must be present.
REQUIRED_FIELDS: tuple[str, ...] = (
    "id",
    "resume_text",
    "job_description",
    "expected_score_band",
    "notes",
)

#: Keys a fixture JSON object may define. ``expected_match_band`` is optional so
#: fixtures authored before Job Match got its own scale keep loading unchanged;
#: when absent it falls back to ``expected_score_band`` (#118).
OPTIONAL_FIELDS: tuple[str, ...] = ("expected_match_band",)

#: Every key the schema recognises. Anything else in a fixture file is rejected.
KNOWN_FIELDS: tuple[str, ...] = REQUIRED_FIELDS + OPTIONAL_FIELDS


class FixtureError(ValueError):
    """Raised when a fixture file is missing, malformed, or off-schema."""


@dataclass(frozen=True)
class EvalFixture:
    """One hand-authored synthetic resume/job-description evaluation case.

    Attributes:
        id: Stable identifier; must equal the JSON file's stem.
        resume_text: Synthetic resume body. Never real user content (D-041).
        job_description: Synthetic job description, or ``None`` for the no-JD
            case that exercises resume-only scoring.
        expected_score_band: Inclusive ``(min, max)`` band, each in ``0..100``,
            for the Resume Analyzer calibration check only (D-042). Authored on
            the heuristic overall-score scale the check actually measures, not
            the blended scale production reports (#118).
        notes: Short description of what the fixture is meant to exercise.
        expected_match_band: Inclusive ``(min, max)`` band for the Job Match
            calibration check. Job Match scores keyword overlap with the JD,
            which is a different scale from resume quality, so it carries its own
            band; defaults to ``expected_score_band`` when the fixture omits it.
    """

    id: str
    resume_text: str
    job_description: str | None
    expected_score_band: tuple[int, int]
    notes: str
    expected_match_band: tuple[int, int] | None = None

    def __post_init__(self) -> None:
        # Resolve the default here rather than in every consumer, so the two
        # bands are always both present and a caller never has to know which
        # fixtures predate the Job Match split.
        if self.expected_match_band is None:
            object.__setattr__(self, "expected_match_band", self.expected_score_band)


def _require_non_empty_str(value: object, field: str, source: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FixtureError(f"{source}: field '{field}' must be a non-empty string")
    return value


def _parse_score_band(value: object, source: str, field: str) -> tuple[int, int]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise FixtureError(f"{source}: '{field}' must be a [min, max] pair")
    low, high = value
    # bool is a subclass of int; reject it explicitly so True/False can't pass.
    if any(isinstance(bound, bool) or not isinstance(bound, int) for bound in (low, high)):
        raise FixtureError(f"{source}: '{field}' bounds must be integers")
    if not (0 <= low <= high <= 100):
        raise FixtureError(
            f"{source}: '{field}' must satisfy 0 <= min <= max <= 100, "
            f"got [{low}, {high}]"
        )
    return (low, high)


def _parse_fixture(path: Path) -> EvalFixture:
    source = path.name
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise FixtureError(f"{source}: invalid JSON ({exc})") from exc

    if not isinstance(raw, dict):
        raise FixtureError(f"{source}: top-level JSON must be an object")

    missing = [field for field in REQUIRED_FIELDS if field not in raw]
    if missing:
        raise FixtureError(f"{source}: missing field(s): {', '.join(missing)}")
    unknown = [key for key in raw if key not in KNOWN_FIELDS]
    if unknown:
        raise FixtureError(f"{source}: unknown field(s): {', '.join(sorted(unknown))}")

    fixture_id = _require_non_empty_str(raw["id"], "id", source)
    if fixture_id != path.stem:
        raise FixtureError(
            f"{source}: 'id' ({fixture_id!r}) must match the filename stem "
            f"({path.stem!r})"
        )

    resume_text = _require_non_empty_str(raw["resume_text"], "resume_text", source)
    notes = _require_non_empty_str(raw["notes"], "notes", source)

    job_description = raw["job_description"]
    if job_description is not None:
        job_description = _require_non_empty_str(
            job_description, "job_description", source
        )

    expected_score_band = _parse_score_band(
        raw["expected_score_band"], source, "expected_score_band"
    )

    # Absent means "reuse the resume band" (EvalFixture resolves it); an explicit
    # value still has to be a well-formed band.
    raw_match_band = raw.get("expected_match_band")
    expected_match_band = (
        None
        if raw_match_band is None
        else _parse_score_band(raw_match_band, source, "expected_match_band")
    )

    return EvalFixture(
        id=fixture_id,
        resume_text=resume_text,
        job_description=job_description,
        expected_score_band=expected_score_band,
        notes=notes,
        expected_match_band=expected_match_band,
    )


def load_fixtures(fixtures_dir: Path | None = None) -> list[EvalFixture]:
    """Load and validate every fixture JSON file, sorted by ``id``.

    Args:
        fixtures_dir: Directory to read from; defaults to the committed
            ``fixtures/`` directory next to this module.

    Returns:
        Fixtures sorted by ``id`` for deterministic iteration.

    Raises:
        FixtureError: If the directory is missing, empty, contains a
            malformed/off-schema fixture, or has duplicate ids.
    """
    directory = fixtures_dir or FIXTURES_DIR
    if not directory.is_dir():
        raise FixtureError(f"fixtures directory not found: {directory}")

    paths = sorted(directory.glob("*.json"))
    if not paths:
        raise FixtureError(f"no fixture files found in {directory}")

    fixtures = [_parse_fixture(path) for path in paths]

    seen: set[str] = set()
    for fixture in fixtures:
        if fixture.id in seen:
            raise FixtureError(f"duplicate fixture id: {fixture.id}")
        seen.add(fixture.id)

    return sorted(fixtures, key=lambda fixture: fixture.id)
