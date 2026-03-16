from __future__ import annotations

from typing import Any


def attach_premium_outputs(
    tool_name: str,
    payload: dict[str, Any] | None,
) -> dict[str, Any]:
    source = dict(payload or {})
    sections = _existing_sections(source) or _build_sections(tool_name, source)
    blocks = _existing_blocks(source) or _build_editable_blocks(tool_name, source)
    download_title = _to_str(source.get("download_title")) or _build_download_title(
        tool_name, source
    )

    enriched = {
        **source,
        "download_title": download_title,
        "exportable_sections": sections,
    }
    if blocks:
        enriched["editable_blocks"] = blocks
    elif "editable_blocks" in enriched:
        enriched["editable_blocks"] = []
    return enriched


def _build_sections(tool_name: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    builders = {
        "resume": _resume_sections,
        "job-match": _job_match_sections,
        "cover-letter": _cover_letter_sections,
        "interview": _interview_sections,
        "career": _career_sections,
        "portfolio": _portfolio_sections,
    }
    builder = builders.get(tool_name)
    return builder(payload) if builder else []


def _build_editable_blocks(
    tool_name: str,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    builders = {
        "resume": _resume_editable_blocks,
        "cover-letter": _cover_letter_editable_blocks,
        "interview": _interview_editable_blocks,
    }
    builder = builders.get(tool_name)
    return builder(payload) if builder else []


def _existing_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    sections = payload.get("exportable_sections")
    if not isinstance(sections, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(sections):
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": _to_str(item.get("id")) or f"section-{index + 1}",
                "title": _to_str(item.get("title")) or f"Section {index + 1}",
                "body": _to_str(item.get("body")) or None,
                "items": _to_str_list(item.get("items")),
            }
        )
    return normalized


def _existing_blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    blocks = payload.get("editable_blocks")
    if not isinstance(blocks, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(blocks):
        if not isinstance(item, dict):
            continue
        content = _to_str(item.get("content"))
        if not content:
            continue
        normalized.append(
            {
                "id": _to_str(item.get("id")) or f"editable-{index + 1}",
                "label": _to_str(item.get("label")) or f"Editable block {index + 1}",
                "content": content,
                "placeholder": _to_str(item.get("placeholder")) or None,
            }
        )
    return normalized


def _resume_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    issues = _dict_list(payload.get("issues"))
    evidence = _as_dict(payload.get("evidence"))
    role_fit = _as_dict(payload.get("role_fit"))

    revision_items = [
        issue.get("fix")
        for issue in issues[:4]
        if _to_str(issue.get("fix"))
    ]
    if missing_keywords := _to_str_list(evidence.get("missing_keywords")):
        revision_items.append(
            f"Add explicit evidence for: {', '.join(missing_keywords[:4])}."
        )
    quantified = evidence.get("quantified_bullets")
    if isinstance(quantified, int):
        revision_items.append(
            f"Current quantified bullets: {quantified}. Increase this where results matter most."
        )

    return [
        _section(
            "overview",
            "Resume snapshot",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(summary.get("verdict")),
                    _to_str(summary.get("confidence_note")),
                ]
            ),
        ),
        _section(
            "actions",
            "Top revision actions",
            items=_format_top_actions(payload),
        ),
        _section(
            "rewrite",
            "Rewrite suggestions",
            items=[
                _join_parts(
                    [
                        _to_str(issue.get("title")),
                        _to_str(issue.get("fix")),
                    ],
                    separator=": ",
                )
                for issue in issues[:4]
                if _to_str(issue.get("title")) or _to_str(issue.get("fix"))
            ],
        ),
        _section(
            "checklist",
            "Export-ready revision checklist",
            body=(
                f"Target role: {_to_str(role_fit.get('target_role_label'))}"
                if _to_str(role_fit.get("target_role_label"))
                else None
            ),
            items=revision_items,
        ),
    ]


def _job_match_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    requirements = _dict_list(payload.get("requirements"))
    missing = _to_str_list(payload.get("missing_keywords"))

    return [
        _section(
            "brief",
            "Application brief",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(payload.get("recruiter_summary")),
                ]
            ),
            items=[f"Match score: {_to_str(payload.get('match_score')) or '0'}%"],
        ),
        _section(
            "gaps",
            "Gap summary",
            items=[
                _join_parts(
                    [
                        _to_str(item.get("requirement")),
                        _to_str(item.get("resume_evidence")),
                    ],
                    separator=": ",
                )
                for item in requirements
                if _to_str(item.get("status")) != "matched"
            ]
            or [f"Missing keywords: {', '.join(missing)}" if missing else ""],
        ),
        _section(
            "fix-before-applying",
            "What to fix before applying",
            items=[
                _join_parts(
                    [
                        _to_str(item.get("requirement")),
                        _to_str(item.get("suggested_fix")),
                    ],
                    separator=": ",
                )
                for item in requirements
                if _to_str(item.get("status")) != "matched"
            ],
        ),
        _section(
            "handoff",
            "Interview handoff",
            items=_to_str_list(payload.get("interview_focus")),
        ),
    ]


def _cover_letter_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    notes = _dict_list(payload.get("customization_notes"))
    full_text = _to_str(payload.get("full_text")) or _compose_cover_letter_text(payload)

    return [
        _section(
            "summary",
            "Draft summary",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(summary.get("confidence_note")),
                ]
            ),
            items=[f"Tone: {_to_str(payload.get('tone_used')) or 'Professional'}"],
        ),
        _section("draft", "Editable draft", body=full_text),
        _section(
            "notes",
            "Customization notes",
            items=[
                _join_parts(
                    [
                        _to_str(note.get("category")),
                        _to_str(note.get("note")),
                    ],
                    separator=": ",
                )
                for note in notes
            ],
        ),
        _section("actions", "Next steps", items=_format_top_actions(payload)),
    ]


def _interview_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    questions = _dict_list(payload.get("questions"))
    weak_signals = _dict_list(payload.get("weak_signals_to_prepare"))

    printable_questions = [
        _join_parts(
            [
                _to_str(item.get("question")),
                _to_str(item.get("focus_area")),
            ],
            separator=" | ",
        )
        for item in questions
        if _to_str(item.get("question"))
    ]

    return [
        _section(
            "packet",
            "Practice packet",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(summary.get("confidence_note")),
                ]
            ),
            items=_format_top_actions(payload),
        ),
        _section(
            "questions",
            "Printable question set",
            items=printable_questions,
        ),
        _section(
            "gap-prep",
            "Focused gap-prep mode",
            items=[
                _join_parts(
                    [
                        _to_str(item.get("title")),
                        _to_str(item.get("prep_action")),
                    ],
                    separator=": ",
                )
                for item in weak_signals
            ],
        ),
        _section(
            "notes",
            "Interviewer notes",
            items=_to_str_list(payload.get("interviewer_notes")),
        ),
    ]


def _career_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    direction = _as_dict(payload.get("recommended_direction"))
    paths = _dict_list(payload.get("paths"))
    next_steps = _dict_list(payload.get("next_steps"))

    return [
        _section(
            "memo",
            "Decision memo",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(direction.get("role_title")),
                    _to_str(direction.get("why_now")),
                ]
            ),
            items=[
                _join_parts(
                    [
                        "Transition timeline",
                        _to_str(direction.get("transition_timeline")),
                    ],
                    separator=": ",
                )
            ],
        ),
        _section(
            "comparison",
            "Path comparison",
            items=[
                _join_parts(
                    [
                        _to_str(path.get("role_title")),
                        _to_str(path.get("rationale")),
                    ],
                    separator=": ",
                )
                for path in paths
            ],
        ),
        _section(
            "gaps",
            "Skill gaps to close",
            items=[
                _join_parts(
                    [
                        _to_str(item.get("skill")),
                        _to_str(item.get("how_to_build")),
                    ],
                    separator=": ",
                )
                for item in _dict_list(payload.get("skill_gaps"))
            ],
        ),
        _section(
            "transition-plan",
            "Transition plan",
            items=[
                _join_parts(
                    [
                        _to_str(item.get("timeframe")),
                        _to_str(item.get("action")),
                    ],
                    separator=": ",
                )
                for item in next_steps
            ],
        ),
    ]


def _portfolio_sections(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _as_dict(payload.get("summary"))
    strategy = _as_dict(payload.get("portfolio_strategy"))
    projects = _dict_list(payload.get("projects"))
    sequence = _dict_list(payload.get("sequence_plan"))

    return [
        _section(
            "plan",
            "Showcase plan",
            body=_join_parts(
                [
                    _to_str(summary.get("headline")),
                    _to_str(strategy.get("headline")),
                    _to_str(strategy.get("focus")),
                ]
            ),
            items=[
                _join_parts(
                    ["Proof goal", _to_str(strategy.get("proof_goal"))],
                    separator=": ",
                )
            ],
        ),
        _section(
            "briefs",
            "Project briefs",
            items=[
                _join_parts(
                    [
                        _to_str(project.get("project_title")),
                        _to_str(project.get("description")),
                    ],
                    separator=": ",
                )
                for project in projects
            ],
        ),
        _section(
            "roadmap",
            "Sequenced roadmap",
            items=[
                _join_parts(
                    [
                        f"Step {_to_str(item.get('order')) or str(index + 1)}",
                        _to_str(item.get("project_title")),
                        _to_str(item.get("reason")),
                    ]
                )
                for index, item in enumerate(sequence)
            ],
        ),
        _section(
            "presentation",
            "Presentation tips",
            items=_to_str_list(payload.get("presentation_tips")),
        ),
    ]


def _resume_editable_blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for index, issue in enumerate(_dict_list(payload.get("issues"))[:3]):
        title = _to_str(issue.get("title")) or f"Rewrite area {index + 1}"
        content = _join_parts(
            [
                f"Problem: {title}",
                _prefixed("Why it matters", issue.get("why_it_matters")),
                _prefixed("Current evidence", issue.get("evidence")),
                _prefixed("Rewrite direction", issue.get("fix")),
            ],
            separator="\n",
        )
        if content:
            blocks.append(
                {
                    "id": _to_str(issue.get("id")) or f"resume-rewrite-{index + 1}",
                    "label": f"Rewrite block {index + 1}",
                    "content": content,
                    "placeholder": "Turn this into a tighter bullet or section rewrite.",
                }
            )
    return blocks


def _cover_letter_editable_blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    opening = _section_text(payload.get("opening"))
    if opening:
        blocks.append(
            {
                "id": "opening",
                "label": "Opening",
                "content": opening,
                "placeholder": "Rewrite the opening paragraph.",
            }
        )
    for index, item in enumerate(_dict_list(payload.get("body_points"))):
        text = _to_str(item.get("text"))
        if not text:
            continue
        blocks.append(
            {
                "id": f"body-{index + 1}",
                "label": f"Body block {index + 1}",
                "content": text,
                "placeholder": "Refine this proof paragraph.",
            }
        )
    closing = _section_text(payload.get("closing"))
    if closing:
        blocks.append(
            {
                "id": "closing",
                "label": "Closing",
                "content": closing,
                "placeholder": "Rewrite the close.",
            }
        )
    full_text = _to_str(payload.get("full_text")) or _compose_cover_letter_text(payload)
    if full_text:
        blocks.append(
            {
                "id": "full-draft",
                "label": "Full draft",
                "content": full_text,
                "placeholder": "Edit the full draft.",
            }
        )
    return blocks


def _interview_editable_blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for index, item in enumerate(_dict_list(payload.get("questions"))):
        question = _to_str(item.get("question")) or f"Question {index + 1}"
        answer = _to_str(item.get("answer"))
        if not answer:
            continue
        blocks.append(
            {
                "id": f"answer-{index + 1}",
                "label": question,
                "content": answer,
                "placeholder": "Refine this answer with clearer specifics.",
            }
        )
    return blocks


def _build_download_title(tool_name: str, payload: dict[str, Any]) -> str:
    summary = _as_dict(payload.get("summary"))
    if tool_name == "resume":
        role_fit = _as_dict(payload.get("role_fit"))
        return _join_parts(
            [
                _to_str(role_fit.get("target_role_label")) or "Resume",
                "revision kit",
            ]
        )
    if tool_name == "job-match":
        return _join_parts(
            [
                _to_str(summary.get("verdict")) or "Job match",
                "application brief",
            ]
        )
    if tool_name == "cover-letter":
        return _join_parts(
            [_to_str(payload.get("tone_used")) or "Cover letter", "draft"]
        )
    if tool_name == "interview":
        return "Interview practice packet"
    if tool_name == "career":
        direction = _as_dict(payload.get("recommended_direction"))
        return _join_parts(
            [_to_str(direction.get("role_title")) or "Career", "decision memo"]
        )
    if tool_name == "portfolio":
        return _join_parts(
            [_to_str(payload.get("target_role")) or "Portfolio", "showcase plan"]
        )
    return "Career workbench export"


def _format_top_actions(payload: dict[str, Any]) -> list[str]:
    actions = []
    for item in _dict_list(payload.get("top_actions"))[:4]:
        actions.append(
            _join_parts(
                [
                    _to_str(item.get("title")),
                    _to_str(item.get("action")),
                ],
                separator=": ",
            )
        )
    return [item for item in actions if item]


def _compose_cover_letter_text(payload: dict[str, Any]) -> str:
    parts = [
        _section_text(payload.get("opening")),
        *[
            _to_str(item.get("text"))
            for item in _dict_list(payload.get("body_points"))
            if _to_str(item.get("text"))
        ],
        _section_text(payload.get("closing")),
    ]
    return _join_parts(parts, separator="\n\n")


def _section_text(value: Any) -> str | None:
    if isinstance(value, dict):
        return _to_str(value.get("text"))
    return _to_str(value)


def _section(
    section_id: str,
    title: str,
    *,
    body: str | None = None,
    items: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": section_id,
        "title": title,
        "body": body,
        "items": [item for item in (items or []) if item],
    }


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _to_str(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def _to_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [_to_str(item) for item in value]
    return [item for item in items if item]


def _join_parts(
    parts: list[str | None],
    *,
    separator: str = " ",
) -> str:
    return separator.join(part for part in parts if part)


def _prefixed(label: str, value: Any) -> str | None:
    text = _to_str(value)
    if not text:
        return None
    return f"{label}: {text}"
