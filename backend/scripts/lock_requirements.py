"""Regenerate requirements.txt (the lock) from requirements.in (the intent).

Usage:

    pip install --dry-run --ignore-installed --report /tmp/r.json -r requirements.in
    python scripts/lock_requirements.py /tmp/r.json

``pip --report`` resolves the full dependency graph without installing anything,
so this is safe to run against an environment you do not want modified.

Run it on Linux, or verify the result in CI before merging: the resolver honours
environment markers, so a lock generated on one platform can omit a dependency
another platform needs. The declared set currently carries only Windows markers,
which is why a macOS-generated lock has held.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
INTENT = BACKEND / "requirements.in"
LOCK = BACKEND / "requirements.txt"

HEADER = """# Locked backend dependencies — generated, do not hand-edit.
#
# Declared intent lives in requirements.in. This file pins the fully resolved
# set, including transitive dependencies, so CI, local development and deploy
# install byte-identical versions.
#
# Why this exists (#288): every line here previously used a >= lower bound, so
# each environment resolved independently at install time. CI was running
# fastapi 0.139.2 / starlette 1.3.1 while local development ran 0.120.0 / 0.48.0
# — a nineteen-minor gap plus a Starlette major version, arriving with no commit
# in this repository. FastAPI 0.139 changed how include_router populates
# app.routes, which is how the divergence was noticed at all.
#
# Regenerate after editing requirements.in:
#
#   pip install --dry-run --ignore-installed --report /tmp/r.json -r requirements.in
#   python scripts/lock_requirements.py /tmp/r.json
#
# Upgrades are deliberate: change requirements.in, regenerate, review the diff.
"""


def _normalize(name: str) -> str:
    return name.lower().replace("_", "-")


def _declared_extras() -> dict[str, str]:
    """Extras requested per direct dependency, e.g. ``uvicorn[standard]``.

    The lock must keep them: without the extra, pip would not pull that optional
    dependency set even though the pinned versions for it are listed.
    """
    extras: dict[str, str] = {}
    for raw in INTENT.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z0-9._-]+)(\[[^\]]+\])?", line)
        if match and match.group(2):
            extras[_normalize(match.group(1))] = match.group(2)
    return extras


def main(report_path: str) -> int:
    report = json.loads(Path(report_path).read_text())
    resolved = {
        _normalize(item["metadata"]["name"]): item["metadata"]["version"]
        for item in report["install"]
    }
    if not resolved:
        print(
            "Report contains no packages to install. Re-run pip with "
            "--ignore-installed, otherwise already-present packages are omitted "
            "and the lock would be incomplete.",
            file=sys.stderr,
        )
        return 1

    extras = _declared_extras()
    lines = [f"{name}{extras.get(name, '')}=={resolved[name]}" for name in sorted(resolved)]
    LOCK.write_text(HEADER + "\n".join(lines) + "\n")
    print(f"Locked {len(lines)} packages to {LOCK.relative_to(BACKEND)}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
