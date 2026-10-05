"""Deep match: the full Job Match tool, run on demand for one Discovery listing.

The feed never runs an LLM. When the owner opens or shortlists a listing they can
run Job Match on it with their newest CV and the listing text. The run goes
through the shared tool pipeline and is linked to the listing, so reopening the
listing shows it instead of running again. Regenerating from the result page
follows the ordinary ``parent_run_id`` chain; the newest run in the chain is the
one shown.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.cv_document import CvDocument
from app.models.discovery_personalization import DiscoveryDeepMatchLink
from app.models.tool_run import ToolRun
from app.models.user import User
from app.prompts.job_match import JOB_MATCH_PROMPT_VERSION
from app.schemas.discovery_recommendations import DiscoveryDeepMatch
from app.services.applications import cv_variant_text
from app.services.discovery_recommendations import visible_listing
from app.services.job_matcher import match_job
from app.services.tool_pipeline import run_tool_pipeline

TOOL_NAME = "job-match"
# Job Match accepts at most this much job text (JobMatchRequest.job_description).
_MAX_JOB_TEXT = 20_000


class ListingNotVisibleError(Exception):
    """The listing is hidden from, or unknown to, this owner."""


class NoCvError(Exception):
    """The owner has no CV to match against."""


def linked_deep_match(db: Session, user_id: str, listing_id: str) -> DiscoveryDeepMatch | None:
    """The newest Job Match run for this owner and listing, if one was started."""
    link = (
        db.query(DiscoveryDeepMatchLink)
        .filter(
            DiscoveryDeepMatchLink.user_id == user_id,
            DiscoveryDeepMatchLink.listing_id == listing_id,
        )
        .one_or_none()
    )
    run = db.get(ToolRun, link.tool_run_id) if link else None
    if run is None:
        return None
    while True:
        child = (
            db.query(ToolRun)
            .filter(
                ToolRun.parent_run_id == run.id,
                ToolRun.user_id == user_id,
                ToolRun.tool_name == TOOL_NAME,
            )
            .order_by(ToolRun.created_at.desc())
            .first()
        )
        if child is None:
            break
        run = child
    payload = run.result_payload or {}
    return DiscoveryDeepMatch(
        history_id=run.id,
        match_score=int(payload.get("match_score", 0)),
        verdict=payload.get("verdict"),
        created_at=run.created_at,
    )


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def newest_cv_text(db: Session, user_id: str) -> str:
    """The text of the owner's newest CV, edits included; empty when they have none.

    A CV is the live document (what the owner last edited) or a variant snapshot
    of it; whichever was written last wins, and one with no text is skipped, so a
    document started blank is not "a CV" until it has content.
    """
    candidates: list[tuple[datetime, object]] = []
    for document in db.query(CvDocument).filter(CvDocument.user_id == user_id):
        candidates.append((_aware(document.updated_at), document.sections))
        candidates.extend((_aware(variant.created_at), variant.sections) for variant in document.variants)
    for _written, sections in sorted(candidates, key=lambda item: item[0], reverse=True):
        text = cv_variant_text(sections).strip()
        if text:
            return text
    return ""


async def deep_match(db: Session, user: User, listing_id: str) -> DiscoveryDeepMatch:
    """Run Job Match for a visible listing, or return the run already linked to it."""
    row = visible_listing(db, user.id, listing_id)
    if row is None:
        raise ListingNotVisibleError(listing_id)
    existing = linked_deep_match(db, user.id, listing_id)
    if existing is not None:
        return existing

    cv_text = newest_cv_text(db, user.id)
    if not cv_text:
        raise NoCvError

    listing = row.listing
    job_text = f"{listing.title} at {listing.company}\n\n{listing.description}"[:_MAX_JOB_TEXT]
    response = await run_tool_pipeline(
        tool_name=TOOL_NAME,
        service_fn=match_job,
        service_kwargs={"resume_text": cv_text, "job_description": job_text, "feedback": None},
        label_fn=lambda r: f"Job Match · {listing.title} ({r['match_score']}%)",
        resume_text=cv_text,
        job_description=job_text,
        current_user=user,
        db=db,
        cache_extra_keys={
            "prompt_version": JOB_MATCH_PROMPT_VERSION,
            "model": settings.LLM_MODEL,
        },
    )
    db.add(
        DiscoveryDeepMatchLink(
            user_id=user.id, listing_id=listing_id, tool_run_id=response["history_id"]
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # A concurrent deep match for the same listing linked first; show that one.
        db.rollback()
    found = linked_deep_match(db, user.id, listing_id)
    assert found is not None
    return found
