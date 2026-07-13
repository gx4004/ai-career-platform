from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.queue_rule import KEYWORD_RULE_TYPES, QueueRule, QueueSettings
from app.schemas.discovery_recommendations import DiscoveryRecommendation
from app.schemas.queue_rules import (
    QueueCandidate,
    QueuePreview,
    QueueRuleItem,
    QueueRuleList,
    QueueRulesExport,
    QueueRuleUpsert,
    QueueSettingsResponse,
    QueueSettingsUpsert,
)
from app.services.discovery_recommendations import rank_discovery_recommendations
from app.services.quality_signals import keyword_present

# Applied when the user has not set a volume cap / cost ceiling of their own. The
# queue still enforces a bound so caps and ceilings are never silently unlimited;
# the preview reports these values so the effective limit is always visible.
DEFAULT_MAX_PACKETS_PER_RUN = 10
DEFAULT_COST_CEILING_USD = Decimal("1.00")

# Projected LLM/preparation cost to build one packet, in USD. Used to enforce the
# cost ceiling before packets are actually prepared (packet preparation lands in
# #181). A conservative estimate for cost observability, not billing.
ESTIMATED_PACKET_COST_USD = Decimal("0.05")

_KEYWORD_RULE_TYPES = frozenset(KEYWORD_RULE_TYPES)


class QueueRuleNotFoundError(Exception):
    """The referenced queue rule does not exist for this owner."""


# ── Rule CRUD (owner-scoped) ──


def list_rules(db: Session, user_id: str) -> QueueRuleList:
    rows = (
        db.query(QueueRule)
        .filter(QueueRule.user_id == user_id)
        .order_by(QueueRule.rule_type, QueueRule.created_at)
        .all()
    )
    return QueueRuleList(items=[QueueRuleItem.model_validate(row) for row in rows])


def upsert_rule(db: Session, user_id: str, body: QueueRuleUpsert) -> QueueRuleItem:
    """Create or replace the owner's rule for one dimension (unique per owner)."""
    row = (
        db.query(QueueRule)
        .filter(QueueRule.user_id == user_id, QueueRule.rule_type == body.rule_type)
        .one_or_none()
    )
    if row is None:
        row = QueueRule(user_id=user_id, rule_type=body.rule_type)
        db.add(row)
    row.keywords = body.keywords
    row.min_score = body.min_score
    db.commit()
    db.refresh(row)
    return QueueRuleItem.model_validate(row)


def delete_rule(db: Session, user_id: str, rule_type: str) -> None:
    row = (
        db.query(QueueRule)
        .filter(QueueRule.user_id == user_id, QueueRule.rule_type == rule_type)
        .one_or_none()
    )
    if row is None:
        raise QueueRuleNotFoundError(rule_type)
    db.delete(row)
    db.commit()


# ── Settings (volume cap + cost ceiling) ──


def _settings_row(db: Session, user_id: str) -> QueueSettings | None:
    return (
        db.query(QueueSettings).filter(QueueSettings.user_id == user_id).one_or_none()
    )


def _settings_response(row: QueueSettings | None) -> QueueSettingsResponse:
    if row is None:
        return QueueSettingsResponse(
            max_packets_per_run=DEFAULT_MAX_PACKETS_PER_RUN,
            cost_ceiling_usd=float(DEFAULT_COST_CEILING_USD),
            estimated_packet_cost_usd=float(ESTIMATED_PACKET_COST_USD),
            is_default=True,
        )
    return QueueSettingsResponse(
        max_packets_per_run=row.max_packets_per_run,
        cost_ceiling_usd=round(float(row.cost_ceiling_usd), 4),
        estimated_packet_cost_usd=float(ESTIMATED_PACKET_COST_USD),
        is_default=False,
    )


def get_settings(db: Session, user_id: str) -> QueueSettingsResponse:
    return _settings_response(_settings_row(db, user_id))


def upsert_settings(
    db: Session, user_id: str, body: QueueSettingsUpsert
) -> QueueSettingsResponse:
    row = _settings_row(db, user_id)
    if row is None:
        row = QueueSettings(user_id=user_id)
        db.add(row)
    row.max_packets_per_run = body.max_packets_per_run
    row.cost_ceiling_usd = Decimal(str(body.cost_ceiling_usd))
    db.commit()
    db.refresh(row)
    return _settings_response(row)


# ── Candidate filtering (server-side enforcement) ──


def _listing_text(rec: DiscoveryRecommendation) -> str:
    return f"{rec.title}\n{rec.company}\n{rec.description}"


def _passes_rule(rec: DiscoveryRecommendation, rule: QueueRule) -> bool:
    if rule.rule_type in _KEYWORD_RULE_TYPES:
        keywords = rule.keywords or []
        if not keywords:
            # A keyword rule with no keywords cannot be satisfied; treat as a
            # gate that nothing passes rather than a no-op that lets everything by.
            return False
        text = _listing_text(rec)
        return any(keyword_present(keyword, text) for keyword in keywords)
    # quality_threshold
    threshold = rule.min_score if rule.min_score is not None else 0
    return rec.score >= threshold


def _passes_all_rules(rec: DiscoveryRecommendation, rules: list[QueueRule]) -> bool:
    return all(_passes_rule(rec, rule) for rule in rules)


def preview_queue_candidates(
    db: Session, user_id: str, *, now: datetime | None = None
) -> QueuePreview:
    """Every rule applied server-side, then the volume cap and cost ceiling.

    A listing failing any rule never becomes a candidate (and so never a packet).
    With no rules defined the queue prepares nothing (R15 #180).
    """
    rules = db.query(QueueRule).filter(QueueRule.user_id == user_id).all()
    settings = get_settings(db, user_id)
    volume_cap = settings.max_packets_per_run
    ceiling = Decimal(str(settings.cost_ceiling_usd))
    packet_cost = ESTIMATED_PACKET_COST_USD

    if not rules:
        return QueuePreview(
            prepares=False,
            reason="no_rules_defined",
            evaluated_count=0,
            passed_rules_count=0,
            prepared_count=0,
            excluded_by_volume_cap=0,
            excluded_by_cost_ceiling=0,
            volume_cap=volume_cap,
            cost_ceiling_usd=round(float(ceiling), 4),
            estimated_packet_cost_usd=round(float(packet_cost), 4),
            estimated_total_cost_usd=0.0,
            candidates=[],
        )

    ranked = rank_discovery_recommendations(db, user_id, now=now)
    evaluated = ranked.items
    passed = [rec for rec in evaluated if _passes_all_rules(rec, rules)]

    # Volume cap: keep the highest-ranked candidates up to the cap.
    within_cap = passed[:volume_cap]
    excluded_by_volume = len(passed) - len(within_cap)

    # Cost ceiling: admit candidates while the cumulative projected spend fits.
    admitted: list[DiscoveryRecommendation] = []
    running = Decimal(0)
    excluded_by_cost = 0
    for rec in within_cap:
        if running + packet_cost <= ceiling:
            running += packet_cost
            admitted.append(rec)
        else:
            excluded_by_cost += 1

    candidates = [
        QueueCandidate(
            listing_id=rec.listing_id,
            title=rec.title,
            company=rec.company,
            score=rec.score,
            estimated_cost_usd=round(float(packet_cost), 4),
        )
        for rec in admitted
    ]
    return QueuePreview(
        prepares=True,
        reason="ready",
        evaluated_count=len(evaluated),
        passed_rules_count=len(passed),
        prepared_count=len(admitted),
        excluded_by_volume_cap=excluded_by_volume,
        excluded_by_cost_ceiling=excluded_by_cost,
        volume_cap=volume_cap,
        cost_ceiling_usd=round(float(ceiling), 4),
        estimated_packet_cost_usd=round(float(packet_cost), 4),
        estimated_total_cost_usd=round(float(running), 4),
        candidates=candidates,
    )


# ── Export + deletion cascade (D-099) ──


def export_queue_rules(db: Session, user_id: str) -> QueueRulesExport:
    rules = list_rules(db, user_id)
    settings_row = _settings_row(db, user_id)
    return QueueRulesExport(
        rules=rules.items,
        settings=_settings_response(settings_row) if settings_row is not None else None,
    )


def delete_queue_rules(db: Session, user_id: str) -> dict[str, int]:
    """Owner-scoped hard delete used by the account-deletion cascade.

    Returns per-table counts so the caller's audit line can record what was
    removed without persisting any of the deleted content.
    """
    rules = (
        db.query(QueueRule)
        .filter(QueueRule.user_id == user_id)
        .delete(synchronize_session=False)
    )
    settings = (
        db.query(QueueSettings)
        .filter(QueueSettings.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {"queue_rules": rules, "queue_settings": settings}
