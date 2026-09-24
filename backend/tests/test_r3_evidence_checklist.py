"""Keep the threat model's §14 unknowns table internally consistent.

D-116 originally made the R3 gate depend on two hand-maintained lists agreeing:
the unresolved unknowns in `docs/threat-model.md` §14, and the R3 Evidence
Checklist rows in `docs/launch-checklist.md` that collected them during the R5
staging rehearsal. The checklist file was retired in the Sept 2026 reset
(#319) as unused speculative process; what remains here is the
self-consistency checking of §14 and §15 against each other, which does not
depend on the deleted file.

Precedent for asserting on repository documents from the backend suite:
`test_ci_workflow.py` and `test_deployment_contract.py`.
"""

from __future__ import annotations

import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
THREAT_MODEL = REPOSITORY_ROOT / "docs" / "threat-model.md"

UNKNOWN_ID = re.compile(r"\bD-UNK-\d+\b")


def _section(document: str, heading: str) -> str:
    match = re.search(rf"^{re.escape(heading)}$", document, flags=re.MULTILINE)
    assert match is not None, f"missing heading: {heading}"
    remainder = document[match.end() :]
    end = re.search(r"^#{2,3} ", remainder, flags=re.MULTILINE)
    return remainder[: end.start()] if end else remainder


def _table_row_ids(section: str) -> set[str]:
    """The first-column id of every table row in ``section``."""
    ids: set[str] = set()
    for line in section.splitlines():
        if not line.startswith("|"):
            continue
        first_cell = line.split("|")[1].strip()
        found = UNKNOWN_ID.search(first_cell)
        if found:
            ids.add(found.group())
    return ids


def _unresolved_unknowns() -> set[str]:
    document = THREAT_MODEL.read_text(encoding="utf-8")
    section = _section(document, "## §14 Unknowns Requiring Human Decisions")
    # §14 carries the open table first and a "### Resolved" table after it.
    open_table = section.split("### Resolved")[0]
    return _table_row_ids(open_table)


def _resolved_unknowns() -> set[str]:
    document = THREAT_MODEL.read_text(encoding="utf-8")
    section = _section(document, "### Resolved")
    return _table_row_ids(section)


def test_no_open_unknown_is_also_listed_as_resolved():
    resolved = _resolved_unknowns()
    unresolved = _unresolved_unknowns()

    assert unresolved, "§14 lists no open unknowns — the parser is not seeing the table"
    assert resolved, "§14's Resolved table is empty — the parser is not seeing it"
    assert not (resolved & unresolved), (
        "An unknown is listed as both open and resolved in §14: "
        f"{sorted(resolved & unresolved)}"
    )


def test_no_resolved_unknown_is_cited_as_a_current_blocker():
    """§15's dependency map must not name a resolved unknown as still blocking.

    A blocker list that outlives its blocker makes the gate look further away
    than it is, and hides which evidence is genuinely still missing.
    """
    document = THREAT_MODEL.read_text(encoding="utf-8")
    resolved = _resolved_unknowns()
    unresolved = _unresolved_unknowns()
    resolved_only = resolved - unresolved

    offenders = []
    for line in _section(document, "## §15 Blockers & Dependency Map").splitlines():
        if "blocked by" not in line.lower():
            continue
        for cited in UNKNOWN_ID.findall(line):
            if cited in resolved_only:
                offenders.append(f"{cited} in: {line.strip()[:120]}")

    assert offenders == [], (
        "§15 cites resolved unknowns as active blockers: " + "; ".join(offenders)
    )


DECISION_ID = re.compile(r"\bD-\d{3}\b")


def test_section_14_prose_does_not_contradict_its_own_tables():
    """The narrative above the table must not present a resolved id as open.

    Naming a resolved unknown is fine — saying so is often the clearest thing to
    write. Naming it *without* its resolution is what previously left the
    introduction claiming D-UNK-5 was a pending human decision months after
    D-118 and D-119 decided both of its halves.
    """
    document = THREAT_MODEL.read_text(encoding="utf-8")
    section = _section(document, "## §14 Unknowns Requiring Human Decisions")
    prose = section.split("| ID |")[0]
    resolved_only = _resolved_unknowns() - _unresolved_unknowns()

    offenders = []
    for sentence in re.split(r"(?<=[.!?])\s+", prose):
        cited = {found for found in UNKNOWN_ID.findall(sentence) if found in resolved_only}
        if not cited:
            continue
        states_resolution = "resolved" in sentence.lower() or DECISION_ID.search(sentence)
        if not states_resolution:
            offenders.append(f"{sorted(cited)} in: {' '.join(sentence.split())[:120]}")

    assert offenders == [], (
        "§14's introduction names resolved unknowns without stating their "
        "resolution, so it reads as if they were still open: " + "; ".join(offenders)
    )
