"""R11 Evidence Profile injection through the shared pipeline (#147, D-063).

These are pipeline-seam tests: they drive `run_tool_pipeline` (the single
execution seam) and assert prompt composition per confirmation state for a
scored tool (Resume) and a generative tool (Cover Letter), plus the cache-key,
disable-switch, and guest/empty-profile behavior the acceptance criteria name.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.models.evidence_item import EvidenceItem
from app.services.cover_letter_gen import generate_cover_letter
from app.services.result_cache import clear_cache
from app.services.resume_analyzer import analyze_resume
from app.services.tool_pipeline import run_tool_pipeline

RESUME = "Experienced engineer who built systems, led teams, and shipped measurable outcomes."
JD = "Seeking a backend engineer with distributed-systems experience and strong ownership."


def _seed_profile(db, user_id: str) -> None:
    """One confirmed, one unconfirmed, one rejected item with unique markers."""
    db.add_all(
        [
            EvidenceItem(
                user_id=user_id,
                kind="skill",
                content={"name": "CONFIRMED_MARKER_RUST"},
                provenance="user-entered",
                confirmation_state="confirmed",
            ),
            EvidenceItem(
                user_id=user_id,
                kind="experience",
                content={"role": "UNCONFIRMED_MARKER_ROLE"},
                provenance="inferred",
                confirmation_state="unconfirmed",
            ),
            EvidenceItem(
                user_id=user_id,
                kind="achievement",
                content={"statement": "REJECTED_MARKER_CLAIM"},
                provenance="imported",
                confirmation_state="rejected",
            ),
        ]
    )
    db.commit()


@pytest.fixture
def injection_enabled(monkeypatch):
    """Turn the dark-by-default injection switch ON for a test.

    Injection ships dark (default False) to honor the open R1–R4 / R3 gate
    (D-060), so tests that exercise the injection path must opt in explicitly
    rather than rely on the default.
    """
    monkeypatch.setattr(settings, "EVIDENCE_PROFILE_INJECTION_ENABLED", True)


# ── Seam wiring: the pipeline builds and injects the payload by state ──────────


@pytest.mark.asyncio
async def test_pipeline_injects_payload_split_by_confirmation_state(db, test_user, injection_enabled):
    _seed_profile(db, test_user.id)
    captured: dict = {}

    async def fake_service(resume_text=None, job_description=None, feedback=None, evidence_profile=None):
        captured["payload"] = evidence_profile
        return {"summary": "ok"}

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=fake_service,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=test_user,
        db=db,
    )

    payload = captured["payload"]
    assert payload is not None
    locked = str(payload.locked_facts)
    gaps = str(payload.gaps)
    # Confirmed → locked facts; unconfirmed → gaps; rejected → excluded entirely.
    assert "CONFIRMED_MARKER_RUST" in locked
    assert "UNCONFIRMED_MARKER_ROLE" not in locked
    assert "UNCONFIRMED_MARKER_ROLE" in gaps
    assert "REJECTED_MARKER_CLAIM" not in locked
    assert "REJECTED_MARKER_CLAIM" not in gaps


@pytest.mark.asyncio
async def test_no_injection_for_guest(db, injection_enabled):
    captured: dict = {"payload": "sentinel"}

    async def fake_service(resume_text=None, job_description=None, feedback=None, evidence_profile=None):
        captured["payload"] = evidence_profile
        return {"summary": "ok"}

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=fake_service,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=None,
        db=db,
    )
    # Guests keep inline inputs — no profile is ever read (D-064).
    assert captured["payload"] is None


@pytest.mark.asyncio
async def test_no_injection_for_user_without_profile_items(db, test_user, injection_enabled):
    captured: dict = {"payload": "sentinel"}

    async def fake_service(resume_text=None, job_description=None, feedback=None, evidence_profile=None):
        captured["payload"] = evidence_profile
        return {"summary": "ok"}

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=fake_service,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=test_user,
        db=db,
    )
    # Empty profile → no payload → tool behaves exactly as today.
    assert captured["payload"] is None


@pytest.mark.asyncio
async def test_default_off_injection_is_a_no_op(db, test_user):
    # Ships dark: the switch defaults OFF to honor the open R1–R4 / R3 gate
    # (D-060), matching #144's dormant build-ahead and the R7 flag pattern.
    assert settings.EVIDENCE_PROFILE_INJECTION_ENABLED is False

    _seed_profile(db, test_user.id)
    captured: dict = {"payload": "sentinel"}

    async def fake_service(resume_text=None, job_description=None, feedback=None, evidence_profile=None):
        captured["payload"] = evidence_profile
        return {"summary": "ok"}

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=fake_service,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=test_user,
        db=db,
    )
    # Default OFF → the profile is never read even with confirmed items present,
    # so tools keep today's inline-input behavior with no data loss (ADR 0005).
    assert captured["payload"] is None


# ── Cache key: the profile version participates and edits invalidate it ───────


@pytest.mark.asyncio
async def test_profile_edit_invalidates_result_cache(db, test_user, injection_enabled):
    clear_cache()
    calls = {"n": 0}

    async def counting_service(resume_text=None, job_description=None, feedback=None, evidence_profile=None):
        calls["n"] += 1
        return {"summary": "ok", "run": calls["n"]}

    kwargs = dict(
        tool_name="resume",
        service_fn=counting_service,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=test_user,
        db=db,
    )

    first = await run_tool_pipeline(**kwargs)
    second = await run_tool_pipeline(**kwargs)
    # Identical inputs and profile → cache hit, service not called again.
    assert first["run"] == second["run"] == 1
    assert calls["n"] == 1

    # Editing the profile changes its version → cache key changes → miss.
    db.add(
        EvidenceItem(
            user_id=test_user.id,
            kind="skill",
            content={"name": "New confirmed skill"},
            provenance="user-entered",
            confirmation_state="confirmed",
        )
    )
    db.commit()

    third = await run_tool_pipeline(**kwargs)
    assert third["run"] == 2
    assert calls["n"] == 2


# ── Prompt composition per state: scored (Resume) and generative (Cover Letter) ─


@pytest.mark.asyncio
async def test_resume_prompt_composition_by_state(db, test_user, monkeypatch, injection_enabled):
    _seed_profile(db, test_user.id)
    captured: dict = {}

    async def fake_complete(system, user):
        captured["user"] = user
        return {}

    monkeypatch.setattr("app.services.resume_analyzer.complete_structured", fake_complete)

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=analyze_resume,
        service_kwargs={"resume_text": RESUME, "job_description": None, "feedback": None},
        label_fn=lambda r: "label",
        resume_text=RESUME,
        current_user=test_user,
        db=db,
    )

    prompt = captured["user"]
    assert "Confirmed evidence profile" in prompt
    assert "CONFIRMED_MARKER_RUST" in prompt
    assert "Unconfirmed profile items" in prompt
    assert "UNCONFIRMED_MARKER_ROLE" in prompt
    # Rejected evidence never reaches the prompt.
    assert "REJECTED_MARKER_CLAIM" not in prompt


@pytest.mark.asyncio
async def test_cover_letter_prompt_composition_by_state(db, test_user, monkeypatch, injection_enabled):
    _seed_profile(db, test_user.id)
    captured: dict = {}

    async def fake_complete(system, user):
        captured["user"] = user
        return {}

    monkeypatch.setattr("app.services.cover_letter_gen.complete_structured", fake_complete)

    await run_tool_pipeline(
        tool_name="cover-letter",
        service_fn=generate_cover_letter,
        service_kwargs={
            "resume_text": RESUME,
            "job_description": JD,
            "tone": "Professional",
            "resume_analysis": None,
            "job_match": None,
            "feedback": None,
        },
        label_fn=lambda r: "label",
        resume_text=RESUME,
        job_description=JD,
        current_user=test_user,
        db=db,
    )

    prompt = captured["user"]
    assert "Confirmed evidence profile" in prompt
    assert "CONFIRMED_MARKER_RUST" in prompt
    assert "Unconfirmed profile items" in prompt
    assert "UNCONFIRMED_MARKER_ROLE" in prompt
    assert "REJECTED_MARKER_CLAIM" not in prompt
