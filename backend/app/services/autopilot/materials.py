"""What Autopilot fills, collected in the request thread from the application."""

from __future__ import annotations

import re
from types import SimpleNamespace

from app.schemas.applications import ApplicationDetailsResponse
from app.schemas.cv_documents import CvStyle
from app.services.autopilot.policy import (
    STANDING_TOPICS,
    AutofillMaterials,
    assert_allowed_apply_url,
    ats_form_url,
)
from app.services.cv_rendering import ATS_TEMPLATE_ID, build_render_model, render_pdf


def _pairs(items) -> list[tuple[str, str]]:
    return [
        (str(item.get("question", "")), str(item.get("answer", "")))
        for item in items or []
        if isinstance(item, dict) and item.get("answer")
    ]


def build_materials(details: ApplicationDetailsResponse, content: dict) -> AutofillMaterials:
    """Collect what to fill. The worker thread never touches the database.

    Contact details and standing answers come only from the owner's application
    details, never from CV text. ``content`` is the application's frozen
    snapshot once it is marked applied, otherwise its current materials
    (``applications.application_content``). The form URL is the one frozen in
    that content, built from the board token and job id; snapshots from before
    it was frozen fall back to building it from their listing links.
    """
    listing = content.get("listing") or {}
    url = listing.get("form_url") or ats_form_url(
        listing.get("source_url"), listing.get("apply_url")
    )
    assert_allowed_apply_url(url or "")

    variant = content.get("cv_variant") or {}
    first, _, last = details.full_name.strip().partition(" ")
    resume_pdf = b""
    if variant.get("sections"):
        document = SimpleNamespace(
            id=variant.get("document_id") or content.get("application_id") or "cv",
            name=variant.get("name") or "CV",
            sections=variant["sections"],
            header=variant.get("header"),
        )
        resume_pdf = render_pdf(
            build_render_model(document, ATS_TEMPLATE_ID, CvStyle(ats_mode=True))
        )
    safe_name = re.sub(r"[^A-Za-z0-9]+", "-", details.full_name).strip("-")
    return AutofillMaterials(
        url=url,
        first_name=first,
        last_name=last.strip(),
        email=details.email,
        phone=details.phone,
        linkedin=details.linkedin,
        website=details.website,
        location=details.location,
        resume_pdf=resume_pdf,
        resume_filename=f"{safe_name}-CV.pdf" if safe_name else "CV.pdf",
        cover_letter=str((content.get("cover_letter") or {}).get("text") or ""),
        answers=_pairs(content.get("screening_answers")),
        owner_answers=_pairs(content.get("answers")),
        standing_answers={
            topic: getattr(details, topic) for topic in STANDING_TOPICS if getattr(details, topic)
        },
    )
