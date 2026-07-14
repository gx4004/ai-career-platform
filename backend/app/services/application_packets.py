"""Reference-based application packet preparation (R15 #181).

For each candidate that passes the owner's queue rules — within the volume cap and
cost ceiling (D-094) — this composes one application packet as a set of references
to existing entities (D-093, ADR 0009), never as copies of material content:

- the campaign (a ``Workspace``, created through the R14 adoption seam),
- the canonical discovered listing,
- the selected/tailored CV variant (R12; its D-073 diffs were accepted at creation),
- the generated drafts (a ``ToolRun`` produced through the shared pipeline).

The packet additionally owns two derived, non-material structures: a deterministic
``match_rationale`` (traceable to the R14 ranker signals and the passed queue
rules) and an explicit ``unresolved_questions`` list (mandatory stops that only
the user can resolve — computed and attached, never silently dropped).

Preparation is preparation-only: no submission is performed, scheduled, or
retried (ADR 0009).
"""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.cv_document import CvDocument, CvVariant
from app.models.user import User
from app.schemas.application_packets import (
    ApplicationPacketItem,
    ApplicationPacketList,
    ApplicationPacketsExport,
    PacketPreparationResult,
)
from app.schemas.discovery_recommendations import DiscoveryRecommendation
from app.services.ai_client import complete_structured
from app.services.campaign_reviewer import review_campaign_materials
from app.services.discovery_adoption import adopt_recommendation
from app.services.evidence_injection import EvidencePayload, render_evidence_section
from app.services.input_sanitizer import sanitize_user_input
from app.services.packet_gate import (
    emit_gate_outcome,
    emit_gate_running,
    gate_state_for,
    is_preparation_halted,
)
from app.services.queue_audit import record_queue_audit_event
from app.services.queue_rules import matched_keywords_for_rule, select_admitted_candidates
from app.services.stop_classifier import (
    classify_stop_category,
    stop_categories_in,
    stop_question_text,
)

PACKET_TOOL_NAME = "application-packet"
PACKET_SCHEMA_VERSION = "application-packet/v1"

# The exhaustive, authoritative mandatory-stop classification lives in one place —
# ``app.services.stop_classifier`` (D-095, #182). This module no longer keeps its own
# stop-topic list; the provisional #181 dict was absorbed there so there is a single
# classifier. Both the listing scan below and the generator's screening-answer filter
# route through it, so nothing the system produces can draft a stop field.


# ── CV text projection (read-only; never copied into the packet) ──


def _cv_variant_text(variant: CvVariant | None) -> str:
    """Flatten a CV variant's visible sections into plain text for generation.

    This text is handed to the shared pipeline as input only; it is never stored
    on the packet, which references the variant by id (D-093).
    """
    if variant is None or not isinstance(variant.sections, list):
        return ""
    lines: list[str] = []
    for section in sorted(
        (s for s in variant.sections if isinstance(s, dict)),
        key=lambda s: s.get("position", 0),
    ):
        if section.get("visible", True) is False:
            continue
        heading = section.get("title") or section.get("name")
        if isinstance(heading, str) and heading.strip():
            lines.append(heading.strip())
        for entry in section.get("entries", []) or []:
            if isinstance(entry, dict):
                body = entry.get("body")
                if isinstance(body, str) and body.strip():
                    lines.append(body.strip())
            elif isinstance(entry, str) and entry.strip():
                lines.append(entry.strip())
    return "\n".join(lines)


def _resolve_cv_variant(db: Session, user_id: str, campaign_id: str) -> CvVariant | None:
    """The campaign's selected variant, else the owner's most recent variant.

    Returns None when the owner has no CV document at all — that becomes an
    explicit unresolved question rather than a fabricated CV.
    """
    from app.models.workspace import Workspace

    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == campaign_id, Workspace.user_id == user_id)
        .one_or_none()
    )
    if workspace is not None and workspace.selected_cv_variant_id:
        selected = (
            db.query(CvVariant)
            .filter(CvVariant.id == workspace.selected_cv_variant_id)
            .one_or_none()
        )
        if selected is not None:
            return selected
    return (
        db.query(CvVariant)
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvDocument.user_id == user_id)
        .order_by(CvVariant.created_at.desc())
        .first()
    )


# ── Deterministic match rationale ──


def build_match_rationale(rec: DiscoveryRecommendation, rules: list) -> dict:
    """Compose the packet rationale purely from deterministic signals.

    ``composite_score`` and ``signals`` are the R14 ranker output; ``matched_rules``
    records which owner queue rules the listing passed and the exact keywords that
    fired. No free LLM prose enters the rationale (D-093 traceability).
    """
    signals = [
        {
            "kind": signal.kind,
            "label": signal.label,
            "matched_keywords": list(signal.matched_keywords),
            "evidence_item_ids": list(signal.evidence_item_ids),
            "score": signal.score,
        }
        for signal in rec.rationale
    ]
    matched_rules = [
        {
            "rule_type": rule.rule_type,
            "matched_keywords": matched_keywords_for_rule(rec, rule),
            "min_score": rule.min_score,
        }
        for rule in rules
    ]
    return {
        "composite_score": rec.score,
        "signals": signals,
        "matched_rules": matched_rules,
    }


# ── Unresolved questions (computed + attached, never silently dropped) ──


def _stop_question(category: str) -> dict:
    """A derived, listing-content-free unresolved question for a stop category."""
    return {
        "field": category,
        "category": category,
        "question": stop_question_text(category),  # type: ignore[arg-type]
    }


def merge_unresolved_questions(*groups: list[dict]) -> list[dict]:
    """Merge unresolved-question lists, deduped by ``field`` in first-seen order.

    A stop category surfaced by both the listing scan and the generator's
    screening-answer filter is a single mandatory stop for the packet, so it appears
    exactly once.
    """
    merged: list[dict] = []
    seen: set[str] = set()
    for group in groups:
        for question in group:
            field = question.get("field")
            if field in seen:
                continue
            seen.add(field)
            merged.append(question)
    return merged


def compute_unresolved_questions(
    *, listing_description: str, cv_variant_id: str | None
) -> list[dict]:
    """The mandatory stops determinable from the listing + material availability.

    Deterministic and server-authoritative (D-095): a missing CV variant, plus every
    mandatory-stop topic the authoritative classifier finds in the listing. The
    generator adds any further stops it detects in screening questions; the two are
    merged in :func:`prepare_packets`.
    """
    questions: list[dict] = []
    if cv_variant_id is None:
        questions.append(
            {
                "field": "cv_variant",
                "category": "missing_material",
                "question": "Select or tailor a CV variant before this packet can be approved.",
            }
        )
    questions.extend(_stop_question(category) for category in stop_categories_in(listing_description or ""))
    return questions


# ── Generative drafts (through the shared pipeline; confirmed evidence only) ──


async def compose_packet_materials(
    *,
    resume_text: str,
    job_description: str,
    listing_title: str = "",
    company: str = "",
    evidence_profile: EvidencePayload | None = None,
) -> dict[str, Any]:
    """Generate the packet's optional cover letter + screening-answer drafts.

    Runs as the ``service_fn`` of the shared pipeline, so sanitization, caching,
    persistence, and cost accounting are handled uniformly. Draws only on confirmed
    Evidence Profile items (D-073): the model receives confirmed facts as locked
    facts, and any draft claiming ``support == "confirmed"`` must cite a non-empty
    subset of the confirmed evidence ids, or the composition is rejected.
    """
    confirmed_ids = {
        fact["evidence_item_id"] for fact in (evidence_profile.locked_facts if evidence_profile else [])
    }
    evidence_section = render_evidence_section(evidence_profile) or "No confirmed profile evidence."
    system_prompt = (
        "You prepare an application packet's cover letter and screening-answer drafts. "
        "Propose only truthful content grounded in the CV text or confirmed evidence. "
        "Never state an unconfirmed item as fact. For every screening answer set "
        "support to 'confirmed' (with the confirmed evidence_item_ids you used), "
        "'document' (grounded in the CV text, no evidence ids), or 'unsupported' "
        "(an ungrounded claim the user must confirm). Do not answer sensitive, legal, "
        "eligibility, relocation, demographic, salary, or work-authorization questions "
        "— leave those for the user."
    )
    user_prompt = (
        f"# Role\n{listing_title} at {company}\n\n"
        f"# Listing\n{job_description}\n\n"
        f"# Candidate CV\n{resume_text}\n\n"
        f"# Evidence boundary\n{evidence_section}"
    )
    raw = await complete_structured(system_prompt, user_prompt)

    cover_letter = _validate_cover_letter(raw.get("cover_letter"), confirmed_ids)
    # Never-draft guarantee (D-095, #182): any screening question the authoritative
    # classifier marks as a mandatory stop is dropped from the drafts and emitted as
    # an unresolved question instead — the system produces no content for it.
    screening_answers, stop_questions = _draftable_screening_answers(
        raw.get("screening_answers"), confirmed_ids
    )
    return {
        "schema_version": PACKET_SCHEMA_VERSION,
        "summary": {
            "headline": f"Application packet drafts for {listing_title or 'this role'}".strip(),
        },
        "cover_letter": cover_letter,
        "screening_answers": screening_answers,
        # Mandatory stops detected among the screening questions. Carries only the
        # derived, listing-content-free question (never the raw field/answer text),
        # so nothing sensitive is persisted with the drafts.
        "unresolved_questions": stop_questions,
        # Provenance record: exactly which confirmed items were available. Never
        # includes unconfirmed ids (D-073 confirmed-only enforcement).
        "confirmed_evidence_item_ids": sorted(confirmed_ids),
    }


def _validate_support(item: dict, confirmed_ids: set[str]) -> list[str]:
    """Enforce the D-073 support contract on one draft; return its evidence ids."""
    support = item.get("support", "unsupported")
    ids = [str(i) for i in (item.get("evidence_item_ids") or [])]
    if support == "confirmed":
        if not ids or not set(ids).issubset(confirmed_ids):
            raise ValueError("Packet drafts claimed unavailable confirmed evidence")
    elif support == "document":
        if ids:
            raise ValueError("Document-grounded drafts cannot claim profile provenance")
    elif support != "unsupported":
        raise ValueError("Packet draft carried an unknown support label")
    return ids


def _validate_cover_letter(raw: object, confirmed_ids: set[str]) -> dict | None:
    if not isinstance(raw, dict):
        return None
    ids = _validate_support(raw, confirmed_ids)
    return {
        "body": str(raw.get("body", "")),
        "support": raw.get("support", "unsupported"),
        "evidence_item_ids": ids,
    }


def _draftable_screening_answers(
    raw: object, confirmed_ids: set[str]
) -> tuple[list[dict], list[dict]]:
    """Split the model's screening answers into draftable answers and stop questions.

    Server-authoritative never-draft enforcement (D-095): a question the classifier
    marks as any mandatory stop — or an answer the model could only leave
    ``unsupported`` (an ungrounded/uncertain field) — is never drafted. It is dropped
    from the answers and returned as a deduped unresolved stop question. Only genuinely
    draftable, grounded answers survive, and they still pass the D-073 support check.
    """
    if not isinstance(raw, list):
        return [], []
    answers: list[dict] = []
    stop_questions: list[dict] = []
    seen_stops: set[str] = set()

    def _add_stop(category: str) -> None:
        if category not in seen_stops:
            seen_stops.add(category)
            stop_questions.append(_stop_question(category))

    for item in raw:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", ""))
        category = classify_stop_category(question)
        if category is not None:
            _add_stop(category)
            continue
        # An ungrounded answer is an uncertain/free-form field the user must own.
        if item.get("support", "unsupported") == "unsupported":
            _add_stop("uncertain")
            continue
        ids = _validate_support(item, confirmed_ids)
        answers.append(
            {
                "question": question,
                "answer": str(item.get("answer", "")),
                "support": item.get("support", "unsupported"),
                "evidence_item_ids": ids,
            }
        )
    return answers, stop_questions


# ── Trust-chain reviewer gate (R15 #184, D-097) ──


def _cover_text_from_drafts(response: dict[str, Any]) -> str:
    """Project the generated cover-letter draft the reviewer should scan."""
    cover = response.get("cover_letter")
    if isinstance(cover, dict):
        body = cover.get("body")
        if isinstance(body, str):
            return body
    return ""


async def _run_reviewer_gate(
    db: Session,
    user: User,
    *,
    campaign_id: str,
    cv_text: str,
    listing_description: str,
    drafts_response: dict[str, Any],
) -> tuple[str | None, str]:
    """Run the R13 reviewer on the packet's materials; return (review_run_id, gate_state).

    Runs the Application Quality Reviewer through the shared pipeline so its
    findings persist in a referenceable ToolRun (D-093) — the packet points at it
    by ``review_run_id`` and never copies finding text. A fabrication finding
    (``unsupported_claim``) leaves ``gate_state == "blocked"`` so the packet is
    never queue-eligible; otherwise the gate passes.
    """
    from app.services.tool_pipeline import run_tool_pipeline

    clean_cover = sanitize_user_input(_cover_text_from_drafts(drafts_response))
    review_response = await run_tool_pipeline(
        tool_name="application-reviewer",
        service_fn=review_campaign_materials,
        service_kwargs={
            "resume_text": cv_text,
            "job_description": listing_description,
            "cover_text": clean_cover,
        },
        label_fn=lambda result: f"Packet gate review ({len(result['findings'])} findings)",
        resume_text=cv_text,
        job_description=listing_description,
        workspace_id=campaign_id,
        current_user=user,
        db=db,
        cache_extra_keys={
            "reviewer_version": "v1",
            "cover_sha256": hashlib.sha256(clean_cover.encode()).hexdigest(),
        },
        require_evidence_profile=True,
    )
    findings = review_response.get("findings") or []
    gate_state = gate_state_for(findings)
    emit_gate_outcome(db, gate_state=gate_state)
    return review_response.get("history_id"), gate_state


# ── Preparation orchestration ──


async def prepare_packets(
    db: Session,
    user_id: str,
    *,
    compose_fn: Callable[..., Awaitable[dict[str, Any]]] | None = None,
    now: datetime | None = None,
) -> PacketPreparationResult:
    """Prepare a packet for every admitted candidate, through the shared pipeline.

    Server-authoritative: candidate selection, the volume cap, and the cost
    ceiling are all enforced by :func:`select_admitted_candidates`, so preparation
    never exceeds the user's mandate (D-094). Re-preparing a listing that already
    has a packet is a no-op (idempotent), so no duplicate campaign or drafts are
    created.
    """
    # Local import breaks the tool_runs <-> tool_pipeline import cycle.
    from app.services.tool_pipeline import run_tool_pipeline

    # Pipeline-wide halt gate (D-097): a failing packet-quality / fabrication
    # regression eval halts preparation for everyone until cleared. Consulted before
    # any candidate work so a halted pipeline prepares — and spends — nothing.
    if is_preparation_halted(db):
        return _halted_result()

    compose = compose_fn or compose_packet_materials
    user = db.query(User).filter(User.id == user_id).one()
    selection = select_admitted_candidates(db, user_id, now=now)

    if not selection.prepares:
        return _empty_result(selection)

    # A real preparation run is starting the trust-chain gate.
    emit_gate_running(db)

    prepared: list[ApplicationPacket] = []
    skipped_existing = 0
    for rec in selection.admitted:
        existing = (
            db.query(ApplicationPacket)
            .filter(
                ApplicationPacket.user_id == user_id,
                ApplicationPacket.listing_id == rec.listing_id,
            )
            .one_or_none()
        )
        if existing is not None:
            skipped_existing += 1
            continue

        # A recommendation becomes a campaign only through the adoption seam
        # (D-091, ADR 0009) — this is an explicit user-initiated preparation run.
        campaign = adopt_recommendation(db, user_id, rec.listing_id, now=now)
        cv_variant = _resolve_cv_variant(db, user_id, campaign.id)
        cv_text = _cv_variant_text(cv_variant)

        response = await run_tool_pipeline(
            tool_name=PACKET_TOOL_NAME,
            service_fn=compose,
            service_kwargs={
                "resume_text": cv_text,
                "job_description": rec.description,
                "listing_title": rec.title,
                "company": rec.company,
            },
            label_fn=lambda result, rec=rec: (
                result.get("summary", {}).get("headline") or f"Packet · {rec.title}"
            ),
            resume_text=cv_text,
            job_description=rec.description,
            workspace_id=campaign.id,
            current_user=user,
            db=db,
            require_evidence_profile=True,
        )
        drafts_run_id = response.get("history_id")

        # Trust-chain gate (D-097): run the R13 reviewer on the just-composed
        # materials. An unresolved fabrication finding keeps the packet out of the
        # queue (gate_state="blocked"); its findings surface by-reference via
        # review_run_id.
        review_run_id, gate_state = await _run_reviewer_gate(
            db,
            user,
            campaign_id=campaign.id,
            cv_text=cv_text,
            listing_description=rec.description,
            drafts_response=response,
        )

        rationale = build_match_rationale(rec, selection.rules)
        # Merge the two authoritative stop sources: what the classifier finds in the
        # listing + missing material, and the stops the generator refused to draft
        # among the screening questions. One classifier, deduped by field.
        listing_questions = compute_unresolved_questions(
            listing_description=rec.description,
            cv_variant_id=cv_variant.id if cv_variant else None,
        )
        generated_questions = response.get("unresolved_questions") or []
        unresolved = merge_unresolved_questions(listing_questions, generated_questions)
        packet = ApplicationPacket(
            user_id=user_id,
            campaign_id=campaign.id,
            listing_id=rec.listing_id,
            cv_variant_id=cv_variant.id if cv_variant else None,
            drafts_run_id=drafts_run_id,
            review_run_id=review_run_id,
            match_rationale=rationale,
            unresolved_questions=unresolved,
            status="blocked" if unresolved else "prepared",
            gate_state=gate_state,
            estimated_cost_usd=selection.packet_cost,
        )
        db.add(packet)
        db.commit()
        db.refresh(packet)
        # Append-only audit of the queue action + its gate outcome (D-098, R15
        # #186). Records only outcome classes and the packet id by reference —
        # no rationale, listing, or draft content.
        record_queue_audit_event(
            db,
            user_id=user_id,
            action="packet_prepared",
            packet_id=packet.id,
            details={"status": packet.status},
        )
        record_queue_audit_event(
            db,
            user_id=user_id,
            action="packet_gate_evaluated",
            packet_id=packet.id,
            details={"gate_state": gate_state},
        )
        prepared.append(packet)

    return PacketPreparationResult(
        prepares=True,
        reason="ready",
        prepared_count=len(prepared),
        skipped_existing_count=skipped_existing,
        excluded_by_volume_cap=selection.excluded_by_volume_cap,
        excluded_by_cost_ceiling=selection.excluded_by_cost_ceiling,
        volume_cap=selection.volume_cap,
        cost_ceiling_usd=round(float(selection.cost_ceiling_usd), 4),
        estimated_packet_cost_usd=round(float(selection.packet_cost), 4),
        estimated_total_cost_usd=round(float(selection.packet_cost) * len(prepared), 4),
        packets=[_packet_item(packet) for packet in prepared],
    )


def _halted_result() -> PacketPreparationResult:
    """Preparation refused because the pipeline is halted on a regression eval (D-097)."""
    return PacketPreparationResult(
        prepares=False,
        reason="halted",
        prepared_count=0,
        skipped_existing_count=0,
        excluded_by_volume_cap=0,
        excluded_by_cost_ceiling=0,
        volume_cap=0,
        cost_ceiling_usd=0.0,
        estimated_packet_cost_usd=0.0,
        estimated_total_cost_usd=0.0,
        packets=[],
    )


def _empty_result(selection) -> PacketPreparationResult:
    return PacketPreparationResult(
        prepares=False,
        reason="no_rules_defined",
        prepared_count=0,
        skipped_existing_count=0,
        excluded_by_volume_cap=selection.excluded_by_volume_cap,
        excluded_by_cost_ceiling=selection.excluded_by_cost_ceiling,
        volume_cap=selection.volume_cap,
        cost_ceiling_usd=round(float(selection.cost_ceiling_usd), 4),
        estimated_packet_cost_usd=round(float(selection.packet_cost), 4),
        estimated_total_cost_usd=0.0,
        packets=[],
    )


# ── Owner-facing reads ──


def _packet_item(packet: ApplicationPacket) -> ApplicationPacketItem:
    return ApplicationPacketItem.model_validate(packet)


def list_packets(db: Session, user_id: str) -> ApplicationPacketList:
    rows = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id)
        .order_by(ApplicationPacket.created_at.desc(), ApplicationPacket.id)
        .all()
    )
    return ApplicationPacketList(items=[_packet_item(row) for row in rows])


class PacketNotFoundError(Exception):
    """The referenced packet does not exist for this owner."""


def get_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacketItem:
    row = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id, ApplicationPacket.id == packet_id)
        .one_or_none()
    )
    if row is None:
        raise PacketNotFoundError(packet_id)
    return _packet_item(row)


# ── Export + deletion cascade (D-099) ──


def export_application_packets(db: Session, user_id: str) -> ApplicationPacketsExport:
    return ApplicationPacketsExport(packets=list_packets(db, user_id).items)


def delete_application_packets(db: Session, user_id: str) -> dict[str, int]:
    """Owner-scoped hard delete used by the account-deletion cascade (D-099).

    Returns the count removed so the caller's audit line can record what was
    deleted without persisting any packet content.
    """
    deleted = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {"application_packets": deleted}
