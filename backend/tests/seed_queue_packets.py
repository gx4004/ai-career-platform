"""Seed a realistic Application Queue for the screenshots harness (E2E only).

Not imported by the production app. Writes straight to the database
DATABASE_URL points at, same shape as tests.seed_discovery_listings: a CV
document + variant, two canonical listings with an HTTPS attribution each, a
campaign per listing, a drafts ToolRun (cover letter + screening answers), and
one packet left pending (so the "Ready for review" section has something to
show) and one packet approved through the real approval service (so
"Approved — apply now" shows a genuine handoff) and then marked applied
through the real mark-as-applied service, so both queue sections and both
approved-card states render with real data.

Usage: python -m tests.seed_queue_packets <email>
"""

from __future__ import annotations

import hashlib
import sys
from datetime import UTC, datetime

import app.models  # noqa: F401  (register every mapper)
from app.database import SessionLocal
from app.models.application_packet import ApplicationPacket
from app.models.cv_document import CvDocument, CvVariant
from app.models.discovered_listing import DiscoveredListing, DiscoveredListingAttribution
from app.models.discovery_source import DiscoverySource
from app.models.queue_rule import QueueRule
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.packet_approval_snapshot import approve_packet, preview_packet_approval
from app.services.queue_review import mark_packet_applied

VALID_RATIONALE = {
    "composite_score": 84,
    "signals": [
        {
            "kind": "confirmed_evidence",
            "label": "Python backend experience",
            "matched_keywords": ["python", "fastapi"],
            "evidence_item_ids": [],
            "score": 84,
        }
    ],
    "matched_rules": [
        {"rule_type": "role", "matched_keywords": ["backend engineer"], "min_score": None},
    ],
}

SECTIONS = [
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
                "position": 0,
                "heading": "Senior Backend Engineer",
                "subheading": "Northwind Labs",
                "bullets": [
                    "Led the move of 14 services to FastAPI and PostgreSQL.",
                    "Cut CI pipeline time from 25 to 8 minutes.",
                ],
                "body": "Led the move of 14 services to FastAPI and PostgreSQL.",
            }
        ],
    }
]

LISTINGS = [
    (
        "listing-queue-1",
        "Backend Engineer, Platform",
        "Northwind Labs",
        "Own the Python and FastAPI services behind our billing platform.",
        "https://boards.example.com/northwind/backend-platform",
    ),
    (
        "listing-queue-2",
        "Senior Python Engineer",
        "Brightline",
        "Build reliable payment APIs in Python and mentor engineers.",
        "https://boards.example.com/brightline/senior-python",
    ),
    (
        "listing-queue-3",
        "Platform Engineer",
        "Harbor Health",
        "Run the Kubernetes and Terraform platform behind our care product.",
        "https://boards.example.com/harbor-health/platform-engineer",
    ),
]


def _ensure_listing(db, listing_id: str, title: str, company: str, description: str, source_url: str):
    listing = db.get(DiscoveredListing, listing_id)
    if listing is not None:
        return listing
    listing = DiscoveredListing(
        id=listing_id,
        content_sha256=hashlib.sha256(f"{title}|{company}".encode()).hexdigest(),
        title=title,
        company=company,
        description=description,
    )
    db.add(listing)
    db.flush()
    source = DiscoverySource(
        source_key=f"queue-seed-{listing_id}",
        display_name=f"{company} careers",
        source_family="employer_ats",
        owner="Screenshots harness",
        terms_status="accepted",
        terms_reviewed_at=datetime.now(UTC),
        terms_reviewed_by="screenshots-harness",
        allowed_behavior="ats_integration",
        endpoint_url=source_url,
        allowed_query_parameters=[],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show the company name, the source name and the original link",
        retention_days=45,
        kill_switch=False,
    )
    db.add(source)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=listing_id,
            source_url=source_url,
            retrieved_at=datetime.now(UTC),
        )
    )
    db.flush()
    return listing


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.seed_queue_packets <email>", file=sys.stderr)
        return 2
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == argv[0]).one_or_none()
        if user is None:
            print("not-found")
            return 1

        db.add(
            QueueRule(user_id=user.id, rule_type="role", keywords=["backend engineer", "python"])
        )
        db.add(QueueRule(user_id=user.id, rule_type="location", keywords=["Berlin", "remote"]))

        document = db.query(CvDocument).filter_by(user_id=user.id, name="Queue seed CV").one_or_none()
        if document is None:
            document = CvDocument(user_id=user.id, name="Queue seed CV", sections=SECTIONS)
            db.add(document)
            db.flush()
        variant = (
            db.query(CvVariant)
            .filter_by(document_id=document.id, name="Platform roles")
            .one_or_none()
        )
        if variant is None:
            variant = CvVariant(
                document_id=document.id,
                name="Platform roles",
                target_role="Backend Engineer",
                sections=SECTIONS,
            )
            db.add(variant)
            db.flush()

        for index, (listing_id, title, company, description, source_url) in enumerate(LISTINGS):
            listing = _ensure_listing(db, listing_id, title, company, description, source_url)
            existing = (
                db.query(ApplicationPacket)
                .filter_by(user_id=user.id, listing_id=listing.id)
                .one_or_none()
            )
            if existing is not None:
                continue
            campaign = Workspace(
                user_id=user.id,
                label=f"{title} — {company}",
                company=company,
                role=title,
                discovery_listing_id=listing.id,
            )
            db.add(campaign)
            db.flush()
            drafts = ToolRun(
                user_id=user.id,
                workspace_id=campaign.id,
                tool_name="application-packet",
                label="Packet drafts",
                result_payload={
                    "cover_letter": {
                        "body": (
                            f"Dear {company} team,\n\nI'm excited to apply for the "
                            f"{title} role. My six years building Python and FastAPI "
                            "services line up closely with what you're building.\n\n"
                            "Best,\nAlex"
                        ),
                        "support": "document",
                        "evidence_item_ids": [],
                    },
                    "screening_answers": [
                        {
                            "question": "What's your notice period?",
                            "answer": "Two weeks.",
                            "support": "document",
                            "evidence_item_ids": [],
                        }
                    ],
                },
            )
            db.add(drafts)
            db.flush()
            attribution_id = listing.attributions[-1].id if listing.attributions else None
            packet = ApplicationPacket(
                user_id=user.id,
                campaign_id=campaign.id,
                listing_id=listing.id,
                listing_attribution_id=attribution_id,
                cv_variant_id=variant.id,
                drafts_run_id=drafts.id,
                match_rationale=VALID_RATIONALE,
                unresolved_questions=[],
                status="prepared",
                gate_state="passed",
                decision="pending",
                estimated_cost_usd=0.04,
            )
            db.add(packet)
            db.commit()
            db.refresh(packet)

            # The first listing stays pending (shows "Ready for review"); the
            # other two are approved through the real approval service, and
            # the third is also marked applied — exercising the exact same
            # code path a live approval and mark-as-applied take, so every
            # queue section and every approved-card state shows real data.
            if index in (1, 2):
                preview = preview_packet_approval(db, user.id, packet.id)
                approve_packet(
                    db, user.id, packet.id, expected_material_sha256=preview.material_sha256
                )
                if index == 2:
                    mark_packet_applied(db, user.id, packet.id)

        db.commit()
    finally:
        db.close()
    print("seeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
