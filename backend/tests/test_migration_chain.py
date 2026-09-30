"""The migration chain is deploy head plus exactly one squashed chapter2 revision (#378)."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

DEPLOY_HEAD = "e4a7b2d918f3"


def _script() -> ScriptDirectory:
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    return ScriptDirectory.from_config(config)


def test_single_head_squashed_onto_deploy_head():
    script = _script()
    heads = script.get_heads()
    assert len(heads) == 1
    revision = script.get_revision(heads[0])
    assert revision.down_revision == DEPLOY_HEAD
    assert script.get_revision(DEPLOY_HEAD) is not None
