import json
from datetime import UTC, datetime

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.application_packet import ApplicationPacket
from app.models.cv_document import CvDocument, CvVariant
from app.models.discovered_listing import DiscoveredListing
from app.models.evidence_item import EvidenceItem
from app.models.queue_rule import QueueRule, QueueSettings
from app.models.tool_run import ToolRun
from app.models.user import User
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendation,
    DiscoveryRecommendationList,
    RecommendationAttribution,
    RecommendationSignal,
)
from app.services.application_packets import (
    compose_packet_materials,
    prepare_packets,
)
from app.services.data_export import export_career_data
from app.services.evidence_injection import EvidencePayload
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"

NEUTRAL_DESC = "We build reliable backend systems for a growing engineering team here."


# ── Helpers ──


def _rec(
    listing_id: str,
    *,
    title: str = "Senior Backend Engineer",
    company: str = "Acme",
    description: str = NEUTRAL_DESC,
    score: int = 82,
    rationale: list[RecommendationSignal] | None = None,
) -> DiscoveryRecommendation:
    return DiscoveryRecommendation(
        listing_id=listing_id,
        title=title,
        company=company,
        description=description,
        score=score,
        rationale=rationale or [],
        attributions=[
            RecommendationAttribution(
                source_id="source-1",
                source_name="Licensed Feed",
                source_family="licensed",
                source_url="https://feed.example/jobs/1",
                retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
            )
        ],
    )


def _patch_rank(monkeypatch, recs: list[DiscoveryRecommendation]) -> None:
    """Patch the ranker in every namespace prep touches (queue + adoption seams)."""

    def fake_rank(db, user_id, *, now=None):
        return DiscoveryRecommendationList(
            items=recs, confirmed_item_count=1, preference_item_count=0
        )

    monkeypatch.setattr("app.services.queue_rules.rank_discovery_recommendations", fake_rank)
    monkeypatch.setattr("app.services.discovery_adoption.rank_discovery_recommendations", fake_rank)


async def _stub_compose(*, resume_text, job_description, listing_title="", company="", **kwargs):
    return {
        "schema_version": "application-packet/v1",
        "summary": {"headline": f"Packet drafts for {listing_title}"},
        "cover_letter": {"body": "Draft cover letter body.", "support": "document",
                         "evidence_item_ids": []},
        "screening_answers": [
            {"question": "Why us?", "answer": "Because.", "support": "document",
             "evidence_item_ids": []}
        ],
        "confirmed_evidence_item_ids": [],
    }


def _add_rule(db, user_id, rule_type, *, keywords=None, min_score=None) -> QueueRule:
    rule = QueueRule(user_id=user_id, rule_type=rule_type, keywords=keywords, min_score=min_score)
    db.add(rule)
    db.commit()
    return rule


def _set_settings(db, user_id, *, cap, ceiling) -> None:
    db.add(QueueSettings(user_id=user_id, max_packets_per_run=cap, cost_ceiling_usd=ceiling))
    db.commit()


def _add_listing(db, listing_id: str, *, description: str = NEUTRAL_DESC) -> DiscoveredListing:
    row = DiscoveredListing(
        id=listing_id,
        content_sha256=f"sha-{listing_id}",
        title="Senior Backend Engineer",
        company="Acme",
        description=description,
    )
    db.add(row)
    db.commit()
    return row


def _add_cv_variant(db, user_id: str) -> CvVariant:
    doc = CvDocument(user_id=user_id, name="My CV", sections=[])
    db.add(doc)
    db.flush()
    sections = [
        {
            "id": "sec-exp",
            "kind": "experience",
            "title": "Experience",
            "visible": True,
            "position": 0,
            "entries": [
                {
                    "id": "ent-1",
                    "evidence_item_id": None,
                    "body": "Built backend systems at scale.",
                    "position": 0,
                }
            ],
        }
    ]
    doc.sections = sections
    variant = CvVariant(document_id=doc.id, name="Base", sections=sections)
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


# ── No rules → prepares nothing ──


@pytest.mark.asyncio
async def test_no_rules_prepares_nothing(db, test_user, monkeypatch):
    _patch_rank(monkeypatch, [_rec("l1")])
    result = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert result.prepares is False
    assert result.reason == "no_rules_defined"
    assert result.packets == []
    assert db.query(ApplicationPacket).count() == 0


# ── By reference only (D-093) ──


@pytest.mark.asyncio
async def test_prepares_packet_by_reference(db, test_user, monkeypatch):
    _add_listing(db, "listing-ref")
    variant = _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-ref", title="Senior Backend Engineer")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    result = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert result.prepared_count == 1

    packet = db.query(ApplicationPacket).one()
    # References, not copies.
    assert packet.listing_id == "listing-ref"
    assert packet.cv_variant_id == variant.id
    assert packet.campaign_id is not None
    assert packet.drafts_run_id is not None
    # The campaign is a real owned workspace.
    from app.models.workspace import Workspace

    campaign = db.query(Workspace).filter(Workspace.id == packet.campaign_id).one()
    assert campaign.user_id == test_user.id
    # The generated content lives in the referenced ToolRun, never on the packet row.
    drafts_run = db.query(ToolRun).filter(ToolRun.id == packet.drafts_run_id).one()
    assert drafts_run.tool_name == "application-packet"
    assert "Draft cover letter body." in json.dumps(drafts_run.result_payload)
    # The packet stores only references + derived rationale/questions — no draft or
    # listing content copied into its own columns.
    assert "Draft cover letter body." not in json.dumps(packet.match_rationale)
    assert NEUTRAL_DESC not in json.dumps(packet.match_rationale)


# ── Runs through the shared pipeline ──


@pytest.mark.asyncio
async def test_runs_through_shared_pipeline(db, test_user, monkeypatch):
    _add_listing(db, "listing-pipe")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-pipe")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    # The pipeline persisted a ToolRun for the drafts (sanitize→cache→service→persist).
    runs = db.query(ToolRun).filter(ToolRun.tool_name == "application-packet").all()
    assert len(runs) == 1
    packet = db.query(ApplicationPacket).one()
    assert packet.drafts_run_id == runs[0].id


# ── Deterministic match rationale ──


@pytest.mark.asyncio
async def test_match_rationale_traceable_to_signals(db, test_user, monkeypatch):
    _add_listing(db, "listing-rat")
    _add_cv_variant(db, test_user.id)
    signal = RecommendationSignal(
        kind="confirmed_evidence",
        label="Python backend experience",
        matched_keywords=["python", "backend"],
        evidence_item_ids=["ev-1"],
        score=88,
    )
    _patch_rank(
        monkeypatch,
        [_rec("listing-rat", title="Senior Backend Engineer", score=88, rationale=[signal])],
    )
    _add_rule(db, test_user.id, "role", keywords=["engineer", "python"])

    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    rationale = packet.match_rationale
    assert rationale["composite_score"] == 88
    assert rationale["signals"][0]["evidence_item_ids"] == ["ev-1"]
    assert rationale["signals"][0]["matched_keywords"] == ["python", "backend"]
    # The passed queue rule and the exact keyword that fired are recorded.
    role_rule = next(r for r in rationale["matched_rules"] if r["rule_type"] == "role")
    assert role_rule["matched_keywords"] == ["engineer"]


# ── Draws only on confirmed evidence (D-073) ──


@pytest.mark.asyncio
async def test_compose_downgrades_a_hallucinated_confirmed_claim_instead_of_raising(monkeypatch):
    """A single candidate whose LLM output hallucinates 'confirmed' support for
    evidence that isn't actually confirmed must degrade gracefully — the same
    way a genuinely unsupported claim already does — not raise. Raising here
    would abort the entire prepare_packets batch over one bad classification,
    wasting every other admitted candidate's LLM call in the same run.
    """
    payload = EvidencePayload(
        locked_facts=[{"evidence_item_id": "c1", "kind": "skill", "content": {"t": "Python"}}],
        gaps=[{"evidence_item_id": "u1", "kind": "skill", "content": {"t": "Rust"}}],
    )

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                # Claims an UNCONFIRMED (gap) item as confirmed evidence.
                {"question": "Rust?", "answer": "Expert.", "support": "confirmed",
                 "evidence_item_ids": ["u1"]}
            ],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(
        resume_text="cv", job_description="jd", evidence_profile=payload
    )
    assert result["screening_answers"] == []
    assert [q["category"] for q in result["unresolved_questions"]] == ["uncertain"]
    # The hallucinated, unconfirmed id is never surfaced anywhere in the result.
    assert "u1" not in json.dumps(result)


@pytest.mark.asyncio
async def test_compose_downgrades_an_unknown_support_label_instead_of_raising(monkeypatch):
    payload = EvidencePayload(locked_facts=[], gaps=[])

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": {"body": "Hello.", "support": "definitely-true", "evidence_item_ids": []},
            "screening_answers": [],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(
        resume_text="cv", job_description="jd", evidence_profile=payload
    )
    assert result["cover_letter"]["support"] == "unsupported"
    assert result["cover_letter"]["evidence_item_ids"] == []


@pytest.mark.asyncio
async def test_compose_accepts_confirmed_evidence_only(monkeypatch):
    payload = EvidencePayload(
        locked_facts=[{"evidence_item_id": "c1", "kind": "skill", "content": {"t": "Python"}}],
        gaps=[{"evidence_item_id": "u1", "kind": "skill", "content": {"t": "Rust"}}],
    )

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {"question": "Python?", "answer": "Yes.", "support": "confirmed",
                 "evidence_item_ids": ["c1"]}
            ],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(
        resume_text="cv", job_description="jd", evidence_profile=payload
    )
    # Only confirmed ids are ever surfaced as provenance — never the unconfirmed gap.
    assert result["confirmed_evidence_item_ids"] == ["c1"]
    assert "u1" not in json.dumps(result)


@pytest.mark.asyncio
async def test_prep_injects_only_confirmed_evidence(db, test_user, monkeypatch):
    _add_listing(db, "listing-ev")
    _add_cv_variant(db, test_user.id)
    db.add(
        EvidenceItem(
            user_id=test_user.id, kind="skill", content={"t": "Python"},
            provenance="user-entered", confirmation_state="confirmed",
        )
    )
    db.add(
        EvidenceItem(
            user_id=test_user.id, kind="skill", content={"t": "Rust"},
            provenance="inferred", confirmation_state="unconfirmed",
        )
    )
    db.commit()
    confirmed_id = (
        db.query(EvidenceItem)
        .filter(EvidenceItem.confirmation_state == "confirmed")
        .one()
        .id
    )

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {"cover_letter": None, "screening_answers": []}

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    _patch_rank(monkeypatch, [_rec("listing-ev")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    # Uses the real compose (declares evidence_profile), so the pipeline injects.
    await prepare_packets(db, test_user.id)
    run = db.query(ToolRun).filter(ToolRun.tool_name == "application-packet").one()
    payload = run.result_payload
    assert payload["confirmed_evidence_item_ids"] == [confirmed_id]


@pytest.mark.asyncio
async def test_one_candidates_hallucinated_support_does_not_abort_the_whole_batch(
    db, test_user, monkeypatch
):
    """One admitted candidate whose LLM output hallucinates 'confirmed' support
    must not raise past the prepare_packets loop and abort every other admitted
    candidate in the same run — each of the LLM calls already made for them
    would otherwise be wasted on top of the non-refundable tailoring quota.
    """
    _add_listing(db, "listing-bad", description="We need a backend engineer with Rust.")
    _add_listing(db, "listing-good", description="We need a backend engineer with Python.")
    _add_cv_variant(db, test_user.id)
    _patch_rank(
        monkeypatch,
        [_rec("listing-bad", description="We need a backend engineer with Rust."),
         _rec("listing-good", description="We need a backend engineer with Python.")],
    )
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        if "Rust" in user_prompt:
            return {
                "cover_letter": None,
                "screening_answers": [
                    {"question": "Rust?", "answer": "Expert.", "support": "confirmed",
                     "evidence_item_ids": ["nonexistent-id"]}
                ],
            }
        return {
            "cover_letter": {"body": "Grounded in the CV.", "support": "document",
                              "evidence_item_ids": []},
            "screening_answers": [],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)

    result = await prepare_packets(db, test_user.id)

    assert result.prepares is True
    assert result.prepared_count == 2
    assert db.query(ApplicationPacket).count() == 2


# ── Cap + ceiling enforced during preparation (D-094) ──


@pytest.mark.asyncio
async def test_volume_cap_enforced_during_prep(db, test_user, monkeypatch):
    for i in range(5):
        _add_listing(db, f"cap-{i}")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec(f"cap-{i}") for i in range(5)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    _set_settings(db, test_user.id, cap=2, ceiling=100)

    result = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert result.prepared_count == 2
    assert result.excluded_by_volume_cap == 3
    assert db.query(ApplicationPacket).count() == 2


@pytest.mark.asyncio
async def test_cost_ceiling_enforced_during_prep(db, test_user, monkeypatch):
    for i in range(5):
        _add_listing(db, f"cost-{i}")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec(f"cost-{i}") for i in range(5)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    # 0.10 ceiling admits exactly two packets at 0.05 each.
    _set_settings(db, test_user.id, cap=50, ceiling=0.10)

    result = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert result.prepared_count == 2
    assert result.excluded_by_cost_ceiling == 3
    assert result.estimated_total_cost_usd == pytest.approx(0.10)


# ── Unresolved questions attached explicitly ──


@pytest.mark.asyncio
async def test_unresolved_questions_attached_and_block(db, test_user, monkeypatch):
    _add_listing(db, "listing-visa", description="Visa sponsorship available for this engineer role.")
    _add_cv_variant(db, test_user.id)
    _patch_rank(
        monkeypatch,
        [_rec("listing-visa", description="Visa sponsorship available for this engineer role.")],
    )
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    categories = {q["category"] for q in packet.unresolved_questions}
    assert "work_authorization" in categories
    assert packet.status == "blocked"


@pytest.mark.asyncio
async def test_missing_cv_is_unresolved(db, test_user, monkeypatch):
    _add_listing(db, "listing-nocv")
    _patch_rank(monkeypatch, [_rec("listing-nocv")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    assert packet.cv_variant_id is None
    fields = {q["field"] for q in packet.unresolved_questions}
    assert "cv_variant" in fields
    assert packet.status == "blocked"


# ── Idempotency ──


@pytest.mark.asyncio
async def test_reprepare_is_idempotent(db, test_user, monkeypatch):
    _add_listing(db, "listing-idem")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-idem")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    first = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert first.prepared_count == 1
    second = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert second.prepared_count == 0
    assert second.skipped_existing_count == 1
    assert db.query(ApplicationPacket).count() == 1


# ── Owner scoping ──


@pytest.mark.asyncio
async def test_packets_owner_scoped(db, test_user, monkeypatch):
    other = User(
        email="other-packet@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()
    _add_listing(db, "listing-scope")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-scope")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    # The other user has no rules and sees no packets.
    from app.services.application_packets import list_packets

    assert list_packets(db, other.id).items == []
    assert len(list_packets(db, test_user.id).items) == 1


# ── Deletion cascade + export (D-099) ──


@pytest.mark.asyncio
async def test_deletion_cascade_removes_packets(db, test_user, monkeypatch):
    _add_listing(db, "listing-del")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-del")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert db.query(ApplicationPacket).count() == 1

    delete_all_user_data(db, test_user.id)
    assert db.query(ApplicationPacket).count() == 0


@pytest.mark.asyncio
async def test_export_includes_packets(db, test_user, monkeypatch):
    _add_listing(db, "listing-exp")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-exp")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)

    export = export_career_data(db, test_user.id)
    assert len(export.application_packets.packets) == 1
    assert export.application_packets.packets[0].listing_id == "listing-exp"


# ── Endpoints ──


def test_prepare_endpoint(client, auth_headers, db, test_user, monkeypatch):
    _add_listing(db, "listing-ep")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-ep")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    monkeypatch.setattr(
        "app.services.application_packets.compose_packet_materials", _stub_compose
    )

    resp = client.post(f"{PREFIX}/packets/prepare", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["prepares"] is True
    assert body["prepared_count"] == 1

    listed = client.get(f"{PREFIX}/packets", headers=auth_headers)
    assert listed.status_code == 200
    packet_id = listed.json()["items"][0]["id"]

    one = client.get(f"{PREFIX}/packets/{packet_id}", headers=auth_headers)
    assert one.status_code == 200
    assert one.json()["listing_id"] == "listing-ep"

    missing = client.get(f"{PREFIX}/packets/does-not-exist", headers=auth_headers)
    assert missing.status_code == 404


def test_prepare_endpoint_requires_auth(client):
    assert client.post(f"{PREFIX}/packets/prepare").status_code == 401
