from app.config import Settings, settings
from app.services.result_access import evaluate_result_access
from app.services.tool_runs import build_tool_response


def test_result_access_policy_defaults_off_and_preserves_full_control():
    assert Settings(_env_file=None).RESULT_ACCESS_POLICY_ENABLED is False
    decision = evaluate_result_access(
        surface="export", tool_name="resume", access_mode="guest_demo"
    )
    assert decision.model_dump() == {
        "state": "full",
        "treatment": "control",
        "reason": "policy_disabled",
        "can_export": True,
        "policy_version": "control-v1",
    }


def test_enabling_candidate_neutral_seam_still_grants_full_control(monkeypatch):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", True)
    decision = evaluate_result_access(
        surface="saved_result", tool_name="interview", access_mode="authenticated"
    )
    assert decision.state == "full"
    assert decision.can_export is True
    assert decision.reason == "no_candidate_selected"


def test_live_tool_response_carries_explicit_server_decision():
    response = build_tool_response(
        {"summary": "synthetic"},
        tool_name="resume",
        history_id=None,
        access_mode="guest_demo",
    )
    assert response["access_decision"]["state"] == "full"
    assert response["access_decision"]["can_export"] is True
