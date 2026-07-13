from datetime import UTC, datetime

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.queue_rule import QueueRule, QueueSettings
from app.models.user import User
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendation,
    DiscoveryRecommendationList,
    RecommendationAttribution,
)
from app.services.data_export import export_career_data
from app.services.queue_rules import (
    ESTIMATED_PACKET_COST_USD,
    export_queue_rules,
    preview_queue_candidates,
)
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"


# ── Helpers ──


def _rec(
    listing_id: str,
    *,
    title: str = "Senior Engineer",
    company: str = "Acme",
    description: str = "",
    score: int = 80,
) -> DiscoveryRecommendation:
    return DiscoveryRecommendation(
        listing_id=listing_id,
        title=title,
        company=company,
        description=description,
        score=score,
        rationale=[],
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
    def fake_rank(db, user_id, *, now=None):
        return DiscoveryRecommendationList(
            items=recs, confirmed_item_count=1, preference_item_count=0
        )

    monkeypatch.setattr(
        "app.services.queue_rules.rank_discovery_recommendations", fake_rank
    )


def _add_rule(db, user_id, rule_type, *, keywords=None, min_score=None) -> QueueRule:
    rule = QueueRule(
        user_id=user_id, rule_type=rule_type, keywords=keywords, min_score=min_score
    )
    db.add(rule)
    db.commit()
    return rule


def _set_settings(db, user_id, *, cap, ceiling) -> QueueSettings:
    row = QueueSettings(
        user_id=user_id, max_packets_per_run=cap, cost_ceiling_usd=ceiling
    )
    db.add(row)
    db.commit()
    return row


# ── "No rules → prepares nothing" ──


def test_no_rules_prepares_nothing(db, test_user, monkeypatch):
    _patch_rank(monkeypatch, [_rec("l1"), _rec("l2")])
    preview = preview_queue_candidates(db, test_user.id)
    assert preview.prepares is False
    assert preview.reason == "no_rules_defined"
    assert preview.candidates == []
    assert preview.prepared_count == 0
    assert preview.evaluated_count == 0


# ── Every rule applied server-side ──


def test_role_rule_filters_server_side(db, test_user, monkeypatch):
    _patch_rank(
        monkeypatch,
        [
            _rec("match", title="Backend Engineer"),
            _rec("miss", title="Marketing Manager"),
        ],
    )
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["match"]
    assert preview.passed_rules_count == 1


def test_location_rule_filters_server_side(db, test_user, monkeypatch):
    _patch_rank(
        monkeypatch,
        [
            _rec("match", description="Remote role based in Warsaw, Poland."),
            _rec("miss", description="On-site in Berlin only."),
        ],
    )
    _add_rule(db, test_user.id, "location", keywords=["Warsaw", "Remote"])
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["match"]


def test_compensation_rule_filters_server_side(db, test_user, monkeypatch):
    _patch_rank(
        monkeypatch,
        [
            _rec("match", description="Salary 120000 USD plus equity."),
            _rec("miss", description="Competitive pay, details on request."),
        ],
    )
    _add_rule(db, test_user.id, "compensation", keywords=["salary", "equity"])
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["match"]


def test_work_authorization_rule_filters_server_side(db, test_user, monkeypatch):
    _patch_rank(
        monkeypatch,
        [
            _rec("match", description="Visa sponsorship available for this role."),
            _rec("miss", description="Must already have local work authorization."),
        ],
    )
    _add_rule(db, test_user.id, "work_authorization", keywords=["sponsorship"])
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["match"]


def test_quality_threshold_rule_filters_server_side(db, test_user, monkeypatch):
    _patch_rank(
        monkeypatch,
        [_rec("high", score=85), _rec("low", score=70)],
    )
    _add_rule(db, test_user.id, "quality_threshold", min_score=80)
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["high"]


def test_listing_failing_any_rule_never_becomes_candidate(db, test_user, monkeypatch):
    # Passes the role rule but fails the quality threshold -> excluded entirely.
    _patch_rank(
        monkeypatch,
        [
            _rec("both", title="Data Engineer", score=90),
            _rec("role_only", title="Data Engineer", score=40),
            _rec("quality_only", title="Sales Lead", score=95),
        ],
    )
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    _add_rule(db, test_user.id, "quality_threshold", min_score=80)
    preview = preview_queue_candidates(db, test_user.id)
    assert [c.listing_id for c in preview.candidates] == ["both"]


# ── Volume cap + cost ceiling enforced and visible ──


def test_volume_cap_enforced(db, test_user, monkeypatch):
    _patch_rank(monkeypatch, [_rec(f"l{i}", title="Engineer") for i in range(5)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    _set_settings(db, test_user.id, cap=2, ceiling=100)
    preview = preview_queue_candidates(db, test_user.id)
    assert preview.prepared_count == 2
    assert preview.excluded_by_volume_cap == 3
    assert preview.volume_cap == 2


def test_cost_ceiling_enforced(db, test_user, monkeypatch):
    _patch_rank(monkeypatch, [_rec(f"l{i}", title="Engineer") for i in range(5)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    # Ceiling admits exactly two packets at 0.05 each (0.10), the rest are cut.
    _set_settings(db, test_user.id, cap=50, ceiling=0.10)
    preview = preview_queue_candidates(db, test_user.id)
    assert preview.prepared_count == 2
    assert preview.excluded_by_cost_ceiling == 3
    assert preview.estimated_total_cost_usd == pytest.approx(0.10)
    assert preview.cost_ceiling_usd == pytest.approx(0.10)
    assert preview.estimated_packet_cost_usd == pytest.approx(
        float(ESTIMATED_PACKET_COST_USD)
    )


def test_caps_visible_via_settings_endpoint(client, auth_headers, db, test_user):
    resp = client.get(f"{PREFIX}/queue/settings", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_default"] is True
    assert body["max_packets_per_run"] > 0
    assert body["cost_ceiling_usd"] > 0

    put = client.put(
        f"{PREFIX}/queue/settings",
        json={"max_packets_per_run": 7, "cost_ceiling_usd": 2.5},
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json()["is_default"] is False
    assert put.json()["max_packets_per_run"] == 7
    assert (
        client.get(f"{PREFIX}/queue/settings", headers=auth_headers).json()[
            "cost_ceiling_usd"
        ]
        == 2.5
    )


# ── Owner scoping ──


def test_rules_and_settings_owner_scoped(client, db, test_user, monkeypatch):
    other = User(
        email="other-queue@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    test_headers = {"Authorization": f"Bearer {create_access_token(test_user.id)}"}

    client.put(
        f"{PREFIX}/queue/rules",
        json={"rule_type": "role", "keywords": ["engineer"]},
        headers=other_headers,
    )
    # test_user sees none of the other user's rules.
    resp = client.get(f"{PREFIX}/queue/rules", headers=test_headers)
    assert resp.json()["items"] == []

    # Preview is scoped: test_user has no rules -> prepares nothing.
    _patch_rank(monkeypatch, [_rec("l1", title="Engineer")])
    assert preview_queue_candidates(db, test_user.id).prepares is False
    # The other user does have a rule and prepares candidates.
    assert preview_queue_candidates(db, other.id).prepares is True


# ── CRUD via API ──


def test_rule_crud_and_upsert(client, auth_headers):
    created = client.put(
        f"{PREFIX}/queue/rules",
        json={"rule_type": "role", "keywords": ["engineer", "developer"]},
        headers=auth_headers,
    )
    assert created.status_code == 200
    assert created.json()["keywords"] == ["engineer", "developer"]

    # Upsert replaces the same dimension rather than creating a duplicate.
    updated = client.put(
        f"{PREFIX}/queue/rules",
        json={"rule_type": "role", "keywords": ["architect"]},
        headers=auth_headers,
    )
    assert updated.json()["keywords"] == ["architect"]
    listed = client.get(f"{PREFIX}/queue/rules", headers=auth_headers).json()
    assert len(listed["items"]) == 1

    deleted = client.delete(f"{PREFIX}/queue/rules/role", headers=auth_headers)
    assert deleted.status_code == 204
    assert client.get(f"{PREFIX}/queue/rules", headers=auth_headers).json()["items"] == []
    # Deleting a missing rule is a 404.
    assert client.delete(f"{PREFIX}/queue/rules/role", headers=auth_headers).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"rule_type": "role"},  # keyword rule with no keywords
        {"rule_type": "role", "keywords": []},
        {"rule_type": "role", "keywords": ["x"], "min_score": 50},
        {"rule_type": "quality_threshold"},  # threshold with no score
        {"rule_type": "quality_threshold", "keywords": ["x"], "min_score": 50},
        {"rule_type": "quality_threshold", "min_score": 150},  # out of range
        {"rule_type": "unknown", "keywords": ["x"]},
    ],
)
def test_rule_validation_rejects_bad_shapes(client, auth_headers, body):
    resp = client.put(f"{PREFIX}/queue/rules", json=body, headers=auth_headers)
    assert resp.status_code == 422


def test_settings_validation_rejects_bad_values(client, auth_headers):
    assert (
        client.put(
            f"{PREFIX}/queue/settings",
            json={"max_packets_per_run": 0, "cost_ceiling_usd": 1},
            headers=auth_headers,
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"{PREFIX}/queue/settings",
            json={"max_packets_per_run": 5, "cost_ceiling_usd": 0},
            headers=auth_headers,
        ).status_code
        == 422
    )


def test_queue_endpoints_require_auth(client):
    assert client.get(f"{PREFIX}/queue/rules").status_code in (401, 403)
    assert client.get(f"{PREFIX}/queue/preview").status_code in (401, 403)


# ── Export + deletion cascade (D-099) ──


def test_export_includes_queue_rules(db, test_user):
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    _set_settings(db, test_user.id, cap=8, ceiling=3.0)

    exported = export_queue_rules(db, test_user.id)
    assert len(exported.rules) == 1
    assert exported.rules[0].rule_type == "role"
    assert exported.settings is not None
    assert exported.settings.max_packets_per_run == 8

    full = export_career_data(db, test_user.id)
    assert full.queue_rules.rules[0].keywords == ["engineer"]
    assert full.queue_rules.settings.cost_ceiling_usd == pytest.approx(3.0)


def test_export_without_settings_row(db, test_user):
    _add_rule(db, test_user.id, "quality_threshold", min_score=60)
    exported = export_queue_rules(db, test_user.id)
    assert exported.settings is None
    assert exported.rules[0].min_score == 60


def test_deletion_cascade_removes_queue_data(db, test_user):
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    _add_rule(db, test_user.id, "quality_threshold", min_score=70)
    _set_settings(db, test_user.id, cap=5, ceiling=1.0)

    delete_all_user_data(db, test_user.id)
    assert db.query(QueueRule).count() == 0
    assert db.query(QueueSettings).count() == 0


# ── End-to-end integration with the real ranking heuristic ──


def _source(db, key="feed-a"):
    source = DiscoverySource(
        source_key=key,
        display_name="Feed A",
        source_family="licensed",
        owner="Discovery Operations",
        terms_status="accepted",
        terms_reviewed_at=datetime(2026, 7, 1, tzinfo=UTC),
        terms_reviewed_by="reviewer@example.com",
        allowed_behavior="feed",
        endpoint_url="https://feed-a.example/jobs",
        allowed_query_parameters=["role"],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show source and link",
        retention_days=30,
        kill_switch=False,
    )
    db.add(source)
    db.commit()
    return source


def _listing(db, source, *, title, description, retrieved_at):
    listing = DiscoveredListing(
        content_sha256=(title + description).encode().hex()[:64].ljust(64, "0"),
        title=title,
        company="Acme",
        description=description,
    )
    db.add(listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=f"{source.source_key}:{listing.id}",
            source_url=f"https://{source.source_key}.example/jobs/{listing.id}",
            retrieved_at=retrieved_at,
        )
    )
    db.commit()
    return listing


def test_real_ranking_integration_role_rule(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source(db)
    match = _listing(
        db, source, title="Kubernetes Engineer", description="Kubernetes platform work.",
        retrieved_at=now,
    )
    _listing(
        db, source, title="Content Writer", description="Blog and marketing copy.",
        retrieved_at=now,
    )
    db.add(
        EvidenceItem(
            user_id=test_user.id,
            kind="skill",
            content={"name": "Kubernetes"},
            provenance="user-entered",
            confirmation_state="confirmed",
        )
    )
    db.commit()

    _add_rule(db, test_user.id, "role", keywords=["Kubernetes"])
    preview = preview_queue_candidates(db, test_user.id, now=now)
    assert preview.prepares is True
    assert [c.listing_id for c in preview.candidates] == [match.id]
