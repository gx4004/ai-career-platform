"""The migration chain is deploy head, the squashed chapter2 revision (#378), then later ones."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

DEPLOY_HEAD = "e4a7b2d918f3"
SQUASH = "c2a0f1e5d7b3"


def _script() -> ScriptDirectory:
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    return ScriptDirectory.from_config(config)


def test_single_head_squashed_onto_deploy_head():
    script = _script()
    heads = script.get_heads()
    assert len(heads) == 1
    assert script.get_revision(SQUASH).down_revision == DEPLOY_HEAD
    # Every later revision descends from the squash in a straight line.
    walked = [rev.revision for rev in script.walk_revisions()]
    assert walked.index(SQUASH) == len(walked) - 1 - walked[::-1].index(DEPLOY_HEAD) - 1
    assert script.get_revision(DEPLOY_HEAD) is not None
