"""Seed a realistic set of Applications for the screenshots harness (E2E only).

Not imported by the production app. Adds applications across every board
column, with job postings, tasks, notes and activity. Two saved ones are
prepared (drafts + open questions): one is ready to apply, one still has a
question to answer. The applied ones go through the real mark-as-applied
service, so they carry a genuine snapshot. Prints the id of the richest
application so the harness can open its page. Same shape as
tests.seed_discovery_listings: it writes straight to DATABASE_URL.

It also names the account and its CVs "Alex Morgan" (the demo persona) and links each
application to the Discover listing for the same job when tests.seed_discovery_listings
ran first, so Discover shows those jobs as Added.

Usage: python -m tests.seed_campaigns <email>
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  (register every mapper)
from app.database import SessionLocal
from app.models.application_snapshot import ApplicationSnapshot
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_task import CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.discovered_listing import DiscoveredListing
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.cv_documents import CvHeader
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


def _prepare(
    db, user: User, workspace: Workspace, role: str, company: str, kind: str, when: datetime
) -> None:
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
                         details={"open_question_count": 1}, created_at=when))


DEMO_NAME = "Alex Morgan"
DEMO_HEADLINE = "Senior Backend Engineer"
DEMO_LOCATION = "Berlin, Germany"


def _update_workspace(db, workspace: Workspace, **values) -> None:
    """Write workspace columns without touching ``updated_at`` (its onupdate would stamp
    "now", and the board's Last activity reads it)."""
    db.flush()
    db.query(Workspace).filter(Workspace.id == workspace.id).update(
        {**{getattr(Workspace, name): value for name, value in values.items()},
         Workspace.updated_at: Workspace.updated_at},
        synchronize_session=False,
    )
    db.refresh(workspace)


def apply_demo_identity(db, user: User) -> list[str]:
    """Name the account and its CV headers "Alex Morgan", as the demo CV already is.

    A CV header that carries someone else's name (not blank, not the old account
    name) is left alone. Returns what changed."""
    changes: list[str] = []
    previous = (user.full_name or "").strip()
    if previous != DEMO_NAME:
        user.full_name = DEMO_NAME
        changes.append(f"account name {previous!r} -> {DEMO_NAME!r}")
    for document in db.query(CvDocument).filter_by(user_id=user.id):
        header = CvHeader.model_validate(document.header or {}).model_dump()
        if (header["name"] or "") not in ("", previous, DEMO_NAME):
            continue
        updated = {
            **header,
            "name": DEMO_NAME,
            "headline": header["headline"] or DEMO_HEADLINE,
            "location": header["location"] or DEMO_LOCATION,
        }
        if updated != header:
            document.header = updated
            changes.append(f"CV {document.name!r} header -> {DEMO_NAME}, {updated['headline']}, {updated['location']}")
    return changes


def link_discovery_listings(db, user: User) -> list[str]:
    """Link each application to the Discover listing for the same job (title + company),
    so Discover shows it as Added instead of offering to add it again."""
    workspaces = db.query(Workspace).filter_by(user_id=user.id).order_by(Workspace.created_at).all()
    taken = {workspace.discovery_listing_id for workspace in workspaces if workspace.discovery_listing_id}
    changes: list[str] = []
    for workspace in workspaces:
        if workspace.discovery_listing_id or not (workspace.role and workspace.company):
            continue
        listing = (
            db.query(DiscoveredListing)
            .filter_by(title=workspace.role, company=workspace.company)
            .order_by(DiscoveredListing.id)
            .first()
        )
        if listing is None or listing.id in taken:
            continue
        _update_workspace(db, workspace, discovery_listing_id=listing.id)
        taken.add(listing.id)
        changes.append(f"{workspace.label}: linked to Discover listing {listing.id}")
    return changes


def backdate_applied(db, workspace: Workspace, when: datetime) -> None:
    """Move "you applied" (applied_at, the snapshot and its events) to ``when``.

    mark_applied stamps the real clock; a seeded history needs the application sent
    before it moved on to Interviewing or Offer."""
    _update_workspace(db, workspace, applied_at=when)
    snapshot = db.query(ApplicationSnapshot).filter_by(workspace_id=workspace.id).one_or_none()
    if snapshot is not None:
        content = json.loads(snapshot.content_json)
        content["applied_at"] = when.isoformat()
        content_json = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        snapshot.content_json = content_json
        snapshot.content_sha256 = hashlib.sha256(content_json.encode()).hexdigest()
        snapshot.created_at = when
    for event in db.query(CampaignEvent).filter_by(workspace_id=workspace.id):
        if event.event_type == "applied" or (
            event.event_type == "status_changed" and (event.details or {}).get("to") == "applied"
        ):
            event.created_at = when


def seed_applications(db, user: User, now: datetime | None = None) -> str | None:
    """Add the six demo applications; returns the id of the richest one."""
    now = now or datetime.now(UTC)
    variant = _cv_variant(db, user)
    featured_id = None
    for role, company, status, deadline_days, updated_ago, score, prepared, tasks in (
        APPLICATIONS
    ):
        updated = now - timedelta(days=updated_ago, hours=2)
        created = updated - timedelta(days=6)
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
            created_at=created,
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
            retrieved_at=created,
        )
        db.add(listing)
        db.flush()
        workspace.current_listing_id = listing.id
        db.add(CampaignEvent(workspace_id=workspace.id, event_type="listing_attached",
                             details={}, created_at=created))
        for title, due, done in tasks:
            db.add(CampaignTask(
                workspace_id=workspace.id,
                title=title,
                deadline=now + timedelta(days=due) if due is not None else None,
                completed=done,
            ))
        if prepared:
            _prepare(db, user, workspace, role, company, prepared, created + timedelta(days=1))
        if featured_id is None:
            featured_id = workspace.id
            workspace.notes = (
                "Priya (Engineering Manager) mentioned the team is moving to "
                "event-driven services this year. Bring up the queueing work.\n"
                "Recruiter: Tom Becker, via LinkedIn."
            )
        if status != "saved":
            # The real mark-as-applied path (snapshot, applied_at, events), then dated
            # so the activity reads in a possible order: applied, then moved on.
            mark_applied(db, workspace, move=True)
            moved_on = updated - timedelta(days=1)
            backdate_applied(db, workspace, moved_on - timedelta(days=2) if status != "applied" else updated)
            workspace.status_changed_at = workspace.applied_at
            if status != "applied":
                db.add(CampaignEvent(workspace_id=workspace.id, event_type="status_changed",
                                     details={"from": "applied", "to": status},
                                     created_at=moved_on))
                workspace.status = status
                workspace.status_changed_at = moved_on
        workspace.updated_at = updated
    db.flush()
    link_discovery_listings(db, user)
    apply_demo_identity(db, user)
    db.commit()
    return featured_id


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.seed_campaigns <email>", file=sys.stderr)
        return 2
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == argv[0]).one_or_none()
        if user is None:
            print("not-found")
            return 1
        featured_id = seed_applications(db, user)
    finally:
        db.close()
    print(featured_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
