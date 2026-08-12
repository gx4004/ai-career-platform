import re
from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CI_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
ACTION_LINE = re.compile(
    r"^\s*(?:-\s*)?uses:\s+"
    r"(?P<action>[^@\s]+)@(?P<sha>[0-9a-f]{40})"
    r"\s+#\s+(?P<release>v\d+(?:\.\d+){0,2})\s*$"
)
VERIFIED_NODE_24_ACTIONS = {
    "actions/checkout": (
        "3d3c42e5aac5ba805825da76410c181273ba90b1",
        "v7.0.1",
    ),
    "actions/setup-node": (
        "820762786026740c76f36085b0efc47a31fe5020",
        "v7.0.0",
    ),
    "actions/setup-python": (
        "5fda3b95a4ea91299a34e894583c3862153e4b97",
        "v7.0.0",
    ),
    "actions/upload-artifact": (
        "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        "v7.0.1",
    ),
    "pnpm/action-setup": (
        "0977fd99725f1db4007ccb2928dbb4e90d06cc86",
        "v6.0.10",
    ),
}


def test_ci_actions_are_pinned_to_verified_node_24_releases() -> None:
    action_lines = [
        line
        for line in CI_WORKFLOW.read_text().splitlines()
        if re.match(r"^\s*(?:-\s*)?uses:", line)
        and not re.search(r"uses:\s+\./", line)
    ]

    assert action_lines
    for line in action_lines:
        match = ACTION_LINE.fullmatch(line)
        assert match is not None, f"Action must use a full commit SHA: {line.strip()}"

        action = match.group("action")
        verified_release = VERIFIED_NODE_24_ACTIONS.get(action)
        assert verified_release is not None, f"Review the runtime for new action: {action}"
        assert (match.group("sha"), match.group("release")) == verified_release


def test_ci_jobs_have_read_only_checkout_credentials() -> None:
    workflow = yaml.safe_load(CI_WORKFLOW.read_text())

    assert workflow["permissions"] == {"contents": "read"}
    for job in workflow["jobs"].values():
        for step in job.get("steps", []):
            if step.get("uses", "").startswith("actions/checkout@"):
                assert step.get("with", {}).get("persist-credentials") is False
