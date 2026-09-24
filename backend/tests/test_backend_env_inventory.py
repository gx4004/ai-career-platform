"""Keep `backend/.env.example` in step with the settings it documents.

`docs/threat-model.md` treats the two `.env.example` files as the deployment
environment inventory, and D-UNK-9 makes "the full production environment
variable inventory diffed against both `.env.example` files" an R3 evidence
item. That diff is only meaningful if the checked-in file is complete.

`test_deployment_contract.py` already guards the frontend file. Nothing guarded
this one, and it drifted: `RESULT_CACHE_MAX_ENTRIES` was added to `Settings`
beside two documented `RESULT_CACHE_*` keys and left undocumented.

Every field of `Settings` is read from the environment under its own name, so
the two sets must match exactly — in both directions. A missing entry hides a
knob from whoever configures a deployment; a stale entry sends them looking for
a setting that no longer exists.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"
ENV_ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=")


def _documented_variables() -> set[str]:
    """Every variable named in `.env.example`, commented-out lines included.

    A commented example is still documentation — several optional settings ship
    that way — so the leading `#` is stripped before matching.
    """
    documented: set[str] = set()
    for raw_line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip().removeprefix("#").strip()
        if match := ENV_ASSIGNMENT.match(line):
            documented.add(match.group(1))
    return documented


def test_env_example_documents_exactly_the_backend_settings() -> None:
    settings = set(Settings.model_fields)
    documented = _documented_variables()

    assert settings, "Settings exposes no fields — the inventory check is vacuous"
    assert documented, ".env.example documents no variables — the parser is broken"

    assert settings - documented == set(), (
        "backend/.env.example is missing settings that Settings reads from the "
        f"environment: {sorted(settings - documented)}"
    )
    assert documented - settings == set(), (
        "backend/.env.example documents variables that Settings no longer reads: "
        f"{sorted(documented - settings)}"
    )
