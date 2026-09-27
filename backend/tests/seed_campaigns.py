"""Seed a realistic set of Applications for the screenshots harness (E2E only).

Not imported by the production app. Adds applications across every board
column, with job postings, tasks, notes and activity. Two saved ones are
prepared (drafts + open questions): one is ready to apply, one still has a
question to answer. The applied ones go through the real mark-as-applied
service, so they carry a genuine snapshot. Prints the id of the richest
application so the harness can open its page. Same shape as
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
from app.models.campaign_task import CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.application_drafts import question_key
from app.services.applications import mark_applied

DESCRIPTION = (
    "We're hiring a backend engineer to own our FastAPI services and PostgreSQL data "
    "layer. You'll lead schema migrations, build CI/CD pipelines and mentor engineers "
    "across product teams.\n\nWhat you'll need: Python, FastAPI, PostgreSQL, SQLAlchemy, "
    "Docker and CI/CD experience. AWS is a plus."
)

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

SALARY_QUESTION = "What are your salary expectations?"

# (role, company, status, deadline_in_days, updated_days_ago, match_score,
#  prepared: None | "ready" | "question", tasks[(title, due_in_days, done)])
APPLICATIONS = [
    ("Senior Backend Engineer, Platform", "Northwind Labs", "interviewing", 9, 0, 88, None, [
        ("Prepare system design examples", 2, False),
        ("Send thank-you note to Priya", 1, True),
        ("Research the platform team's stack", None, False),
    ]),
    ("Backend Engineer, Payments", "Brightline", "applied", 14, 2, 81, None, [
        ("Follow up with the recruiter", 5, False),
    ]),
    ("Platform Engineer", "Harbor Health", "saved", 6, 1, 76, "ready", [
        ("Tailor CV for platform roles", 3, False),
    ]),
    ("Python Developer, Integrations", "Tidewater", "saved", None, 3, 72, "question", []),
    ("Backend Engineer, Inference", "Lumen AI", "offer", 4, 0, 84, None, [
        ("Reply to the offer", 4, False),
    ]),
    ("Full-Stack Engineer", "Quarry", "rejected", None, 12, 64, None, []),
]


def _cv_variant(db, user: User) -> CvVariant:
    variant = (
        db.query(CvVariant)
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvDocument.user_id == user.id)
        .first()
    )
    if variant is not None:
        return variant
    document = CvDocument(user_id=user.id, name="Seed CV", sections=SECTIONS)
    db.add(document)
    db.flush()
    variant = CvVariant(
        document_id=document.id,
        name="Platform roles",
        target_role="Backend Engineer",
        sections=SECTIONS,
    )
    db.add(variant)
    db.flush()
    return variant


def _prepare(db, user: User, workspace: Workspace, role: str, company: str, kind: str) -> None:
    drafts = ToolRun(
        user_id=user.id,
        workspace_id=workspace.id,
        tool_name="application-drafts",
        label=f"Application drafts for {role}",
        result_payload={
            "schema_version": "application-drafts/v1",
            "summary": {"headline": f"Application drafts for {role}"},
            "cover_letter": {
                "body": (
                    f"Dear {company} team,\n\nI'm excited to apply for the {role} role. "
                    "My six years building Python and FastAPI services line up closely "
                    "with what you're building.\n\nBest,\nAlex"
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
    key = question_key(SALARY_QUESTION)
    workspace.drafts_run_id = drafts.id
    workspace.open_questions = [{"key": key, "question": SALARY_QUESTION, "category": "salary"}]
    workspace.answers = {key: "€85–95k"} if kind == "ready" else {}
    db.add(CampaignEvent(workspace_id=workspace.id, event_type="prepared",
                         details={"open_question_count": 1}))


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
        variant = _cv_variant(db, user)
        featured_id = None
        for role, company, status, deadline_days, updated_ago, score, prepared, tasks in (
            APPLICATIONS
        ):
            updated = now - timedelta(days=updated_ago, hours=2)
            slug = company.lower().replace(" ", "-")
            workspace = Workspace(
                user_id=user.id,
                label=f"{role} at {company}",
                role=role,
                company=company,
                status="saved",
                match_score=score,
                selected_cv_variant_id=variant.id,
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
                source_url=f"https://careers.example.com/{slug}",
                apply_url=f"https://careers.example.com/{slug}/apply",
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
            if prepared:
                _prepare(db, user, workspace, role, company, prepared)
            if featured_id is None:
                featured_id = workspace.id
                workspace.notes = (
                    "Priya (Engineering Manager) mentioned the team is moving to "
                    "event-driven services this year. Bring up the queueing work.\n"
                    "Recruiter: Tom Becker, via LinkedIn."
                )
            if status != "saved":
                # The real mark-as-applied path: snapshot, applied_at, events.
                mark_applied(db, workspace, move=True)
                if status != "applied":
                    db.add(CampaignEvent(workspace_id=workspace.id, event_type="status_changed",
                                         details={"from": "applied", "to": status},
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
