import pytest
from fastapi import HTTPException

from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.tool_pipeline import run_tool_pipeline
from app.services.tool_runs import persist_tool_run


def _run(db, *, user_id: str, tool_name: str) -> ToolRun:
    run = ToolRun(user_id=user_id, tool_name=tool_name, label=f"{tool_name} parent")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_persisted_revision_parent_must_match_owner_and_tool(db, test_user):
    other = User(email="lineage-other@example.com", hashed_password="unused")
    db.add(other)
    db.commit()
    db.refresh(other)
    foreign_parent = _run(db, user_id=other.id, tool_name="resume")
    wrong_tool_parent = _run(db, user_id=test_user.id, tool_name="job-match")
    baseline_runs = db.query(ToolRun).count()

    for parent_id in ("not-present", foreign_parent.id, wrong_tool_parent.id):
        with pytest.raises(HTTPException) as error:
            persist_tool_run(
                db,
                current_user=test_user,
                tool_name="resume",
                label="Rejected revision",
                result={"summary": {}},
                parent_run_id=parent_id,
            )

        assert error.value.status_code == 404
        assert error.value.detail == "Parent run not found"
        assert db.query(ToolRun).count() == baseline_runs
        assert db.query(Workspace).count() == 0


def test_persisted_revision_accepts_same_owner_and_tool(db, test_user):
    parent = _run(db, user_id=test_user.id, tool_name="resume")

    child = persist_tool_run(
        db,
        current_user=test_user,
        tool_name="resume",
        label="Accepted revision",
        result={"summary": {}},
        parent_run_id=parent.id,
    )

    assert child is not None
    assert child.parent_run_id == parent.id


@pytest.mark.asyncio
async def test_pipeline_rejects_invalid_parent_before_provider_call(db, test_user):
    provider_called = False

    async def fake_service(resume_text=None):
        nonlocal provider_called
        provider_called = True
        return {"summary": {}}

    with pytest.raises(HTTPException) as error:
        await run_tool_pipeline(
            tool_name="resume",
            service_fn=fake_service,
            service_kwargs={"resume_text": "A" * 80},
            label_fn=lambda _result: "Revision",
            resume_text="A" * 80,
            parent_run_id="not-present",
            current_user=test_user,
            db=db,
        )

    assert error.value.status_code == 404
    assert provider_called is False
    assert db.query(ToolRun).count() == 0
    assert db.query(Workspace).count() == 0
