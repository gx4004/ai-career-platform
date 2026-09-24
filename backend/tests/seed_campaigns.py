"""Seed a realistic application pipeline for the screenshots harness (E2E only).

Not imported by the production app. Adds six campaigns spread across every
board column, with job postings, tasks, notes, contacts and timeline events, so
/campaigns and a campaign detail page have something real to show. Prints the id
of the richest campaign so the harness can open its detail page. Same shape as
tests.seed_discovery_listings: it writes straight to DATABASE_URL.

Usage: python -m tests.seed_campaigns <email>
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  (register every mapper)
from app.database import SessionLocal
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_tracking import CampaignContact, CampaignNote, CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.user import User
from app.models.workspace import Workspace
from app.services.campaign_snapshots import capture_submission_snapshot

DESCRIPTION = (
    "We're hiring a backend engineer to own our FastAPI services and PostgreSQL data "
    "layer. You'll lead schema migrations, build CI/CD pipelines and mentor engineers "
    "across product teams.\n\nWhat you'll need: Python, FastAPI, PostgreSQL, SQLAlchemy, "
    "Docker and CI/CD experience. AWS is a plus."
)

# (role, company, status, deadline_in_days, updated_days_ago, tasks[(title, due_in_days, done)])
CAMPAIGNS = [
    ("Senior Backend Engineer, Platform", "Northwind Labs", "interviewing", 9, 0, [
        ("Prepare system design examples", 2, False),
        ("Send thank-you note to Priya", 1, True),
        ("Research the platform team's stack", None, False),
    ]),
    ("Backend Engineer, Payments", "Brightline", "applied", 14, 2, [
        ("Follow up with the recruiter", 5, False),
    ]),
    ("Platform Engineer", "Harbor Health", "preparing", 6, 1, [
        ("Tailor CV for platform roles", 3, False),
        ("Write cover letter", 4, False),
    ]),
    ("Python Developer, Integrations", "Tidewater", None, None, 3, []),
    ("Backend Engineer, Inference", "Lumen AI", "offer", 4, 0, [
        ("Reply to the offer", 4, False),
    ]),
    ("Full-Stack Engineer", "Quarry", "rejected", None, 12, []),
]


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.seed_campaigns <email>", file=sys.stderr)
        return 2
    now = datetime.now(UTC)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == argv[0]).one_or_none()
        if user is None:
            print("not-found")
            return 1
        variant = (
            db.query(CvVariant)
            .join(CvDocument, CvVariant.document_id == CvDocument.id)
            .filter(CvDocument.user_id == user.id)
            .first()
        )
        featured_id = None
        for role, company, status, deadline_days, updated_ago, tasks in CAMPAIGNS:
            updated = now - timedelta(days=updated_ago, hours=2)
            workspace = Workspace(
                user_id=user.id,
                label=f"{role} at {company}",
                role=role,
                company=company,
                deadline=now + timedelta(days=deadline_days) if deadline_days else None,
                created_at=updated - timedelta(days=6),
                updated_at=updated,
            )
            db.add(workspace)
            db.flush()
            listing = CampaignListing(
                workspace_id=workspace.id,
                title=role,
                company=company,
                description=DESCRIPTION,
                source_url=f"https://careers.example.com/{company.lower().replace(' ', '-')}",
                retrieved_at=updated - timedelta(days=6),
            )
            db.add(listing)
            db.flush()
            workspace.current_listing_id = listing.id
            db.add(CampaignEvent(workspace_id=workspace.id, event_type="listing_attached",
                                 details={}, created_at=updated - timedelta(days=6)))
            for title, due, done in tasks:
                db.add(CampaignTask(
                    workspace_id=workspace.id,
                    title=title,
                    deadline=now + timedelta(days=due) if due is not None else None,
                    completed=done,
                ))
            if featured_id is None:
                featured_id = workspace.id
                if variant is not None:
                    workspace.selected_cv_variant_id = variant.id
                db.add(CampaignNote(
                    workspace_id=workspace.id,
                    text="Priya mentioned the team is moving to event-driven services this "
                    "year. Bring up the queueing work from Brightline.",
                ))
                db.add(CampaignNote(workspace_id=workspace.id,
                                    text="Salary band shared on the first call: €85–95k."))
                db.add(CampaignContact(workspace_id=workspace.id, name="Priya Shah",
                                       role="Engineering Manager", channel="priya@northwind.example"))
                db.add(CampaignContact(workspace_id=workspace.id, name="Tom Becker",
                                       role="Recruiter", channel="LinkedIn"))
            if status in ("applied", "interviewing", "offer", "rejected"):
                workspace.status = "applied"
                capture_submission_snapshot(db, workspace)
                db.add(CampaignEvent(workspace_id=workspace.id, event_type="status_changed",
                                     details={"from": None, "to": "applied"},
                                     created_at=updated - timedelta(days=4)))
            if status and status != "applied":
                db.add(CampaignEvent(workspace_id=workspace.id, event_type="status_changed",
                                     details={"from": "applied" if status != "preparing" else None,
                                              "to": status},
                                     created_at=updated - timedelta(days=1)))
            workspace.status = status
            workspace.updated_at = updated
        db.commit()
    finally:
        db.close()
    print(featured_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
