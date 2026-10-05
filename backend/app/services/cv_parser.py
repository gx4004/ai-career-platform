import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.schemas.cv_documents import CvImportProposal
from app.schemas.tools import ParsedCvResponse

MAX_PDF_PAGES = 100
MAX_EXTRACTED_CHARS = 2_000_000


_NO_TEXT = "No text could be extracted from this file"


class CvParserRejected(Exception):
    pass


def parse_cv(content: bytes, filename: str, ext: str) -> ParsedCvResponse:
    warnings: list[str] = []

    if ext == "pdf":
        text = _extract_pdf(content)
    elif ext == "docx":
        text = _extract_docx(content)
    else:
        raise ValueError(f"Unsupported format: {ext}")

    if not text.strip():
        warnings.append(_NO_TEXT)

    return ParsedCvResponse(
        filename=filename,
        extracted_text=text,
        chars_count=len(text),
        warnings=warnings,
    )


def parse_cv_import(content: bytes, filename: str, ext: str) -> CvImportProposal:
    if ext == "docx":
        lines = _docx_lines(content)
        warnings = [] if any(line.text.strip() for line in lines) else [_NO_TEXT]
        return _structure_lines(_clean_docx_lines(lines), filename, warnings, wraps=False)
    if ext == "txt":
        text = content.decode("utf-8")
        if len(text) > MAX_EXTRACTED_CHARS:
            raise CvParserRejected("Extracted text limit exceeded")
        warnings = []
    else:
        parsed = parse_cv(content, filename, ext)
        text, warnings = parsed.extracted_text, parsed.warnings
    return _structure_text(text, filename, warnings)


# --- Structuring -----------------------------------------------------------
#
# Heuristic only, and conservative: a line that does not clearly match a shape
# stays plain ``body`` text, so the import proposal remains reviewable and
# honest. The parser reads lines (text plus the hints a Word file carries:
# heading style, list paragraph) and turns them into a header, sections and
# entries; ``split_sections`` is shared with the PDF read-back check.


@dataclass
class _Line:
    text: str
    heading: bool = False  # Word "Heading n" style
    title: bool = False  # Word "Title" style
    bullet: bool = False  # list paragraph or a bullet marker
    level: int = 0  # Word heading level (Heading 1 -> 1); 0 when unknown


_BULLET_MARKER = re.compile(r"^(?:[•◦▪▫●○■□·∙‣⁃*]|[-–—])(?:\s+|$)")
_MAX_LINE_FOR_ROLE = 200

_MONTH = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
    r"Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
)
_DATE = rf"(?:(?:{_MONTH})\s+)?(?:19|20)\d{{2}}|\d{{1,2}}/(?:19|20)\d{{2}}"
_END = rf"(?:{_DATE}|Present|Current|Now|Today|Ongoing)"
_RANGE = rf"(?P<start>{_DATE})\s*(?:[–—-]|\bto\b|\buntil\b)\s*(?P<end>{_END})"
_TRAILING_RANGE = re.compile(
    rf"^(?P<rest>.+?)[\s,|·]*[(\[]?\s*{_RANGE}\s*[)\]]?\s*$", re.IGNORECASE
)
_DATE_ONLY = re.compile(rf"^[(\[]?\s*(?:{_RANGE}|(?P<single>{_DATE}))\s*[)\]]?$", re.IGNORECASE)
_TAB_SINGLE = re.compile(rf"^(?P<rest>.+?)\t+\s*(?P<single>{_DATE})\s*$", re.IGNORECASE)
_PAREN_SINGLE = re.compile(rf"^(?P<rest>.+?)\s*\(\s*(?P<single>{_DATE})\s*\)\s*$", re.IGNORECASE)
_HEAD_SPLIT = re.compile(r"^(?P<h>.+?)(?:\s+[–—|@-]\s+|\s*\|\s*|\s+at\s+|\s*,\s*|\t+)(?P<s>.+)$")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")

_EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(
    # The lookbehind keeps a bare domain anchored to a token start, so a long
    # dotted or hyphenated token cannot be rescanned from every position.
    r"(?:https?://|www\.)\S+|(?<![\w.-])(?:[\w-]+\.)+(?:com|io|dev|me|net|org|co|app|tech|ai)(?:/\S*)?",
    re.IGNORECASE,
)
_PHONE = re.compile(r"(?<![\w/])\+?\d[\d\s().-]{5,}\d(?!\w)")
_CONTACT_LABEL = re.compile(
    r"^(?:e-?mail|phone|tel|mobile|cell|linkedin|github|portfolio|website|web|location|address)\s*:\s*",
    re.IGNORECASE,
)
_PLACE = re.compile(r"^[A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*){0,3}(?:, [A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*){0,3}){1,2}$")

# Exact (normalised) section titles. Word heading styles also name sections
# outside this list; those become "custom" sections with their own title.
_SECTION_TITLES: dict[str, tuple[str, ...]] = {
    "summary": (
        "summary", "profile", "professional summary", "career summary", "executive summary",
        "personal profile", "personal statement", "professional profile", "objective",
        "career objective", "about", "about me", "summary of qualifications",
    ),
    "experience": (
        "experience", "work experience", "professional experience", "relevant experience",
        "employment", "employment history", "work history", "career history",
        "professional background", "experience and projects",
    ),
    "achievements": (
        "achievements", "key achievements", "accomplishments", "key accomplishments",
        "selected achievements", "highlights", "career highlights",
    ),
    "skills": (
        "skills", "technical skills", "key skills", "core skills", "core competencies",
        "competencies", "skills and tools", "skills and technologies", "technologies",
        "tech stack", "technical expertise", "areas of expertise", "expertise",
        "tools and technologies",
    ),
    "education": (
        "education", "education and training", "academic background", "educational background",
        "academic qualifications",
    ),
    "projects": (
        "projects", "selected projects", "personal projects", "side projects", "key projects",
        "open source", "open source contributions",
    ),
    "certifications": (
        "certifications", "certificates", "licenses and certifications",
        "licences and certifications", "professional certifications",
        "certifications and licenses",
    ),
    "custom": (
        "languages", "volunteering", "volunteer experience", "volunteer work", "publications",
        "awards", "awards and honors", "honors", "interests", "hobbies", "hobbies and interests",
        "references", "training", "courses", "additional information", "additional",
        "extracurricular activities", "activities", "talks", "speaking",
    ),
}
_TITLE_KIND = {title: kind for kind, titles in _SECTION_TITLES.items() for title in titles}
_ROLE_SECTIONS = {"experience", "education", "projects", "certifications", "custom"}
_CLAIM_BY_SECTION = {
    "skills": "skill", "education": "education", "projects": "project",
    "certifications": "certification", "experience": "experience",
}
MAX_BULLETS = 30
MAX_ENTRIES = 200
MAX_SECTIONS = 50
MAX_BODY_CHARS = 5_000


def title_key(text: str) -> str:
    text = text.lower().replace("&", " and ")
    text = re.sub(r"^[\W_]+|[\W_]+$", "", text)
    return re.sub(r"\s+", " ", text)


def _top_heading_level(lines: list[_Line], extra: dict[str, str] | None) -> int:
    """The Word heading level that starts sections: the shallowest level carrying a
    known section title, else the shallowest heading below the opening (name) line.
    0 when the file has no heading styles."""
    known: list[int] = []
    other: list[int] = []
    first = True
    for line in lines:
        if not line.text.strip():
            continue
        if line.heading and line.level and not line.bullet and len(line.text) <= 80:
            key = title_key(line.text)
            if key and ((extra or {}).get(key) or _TITLE_KIND.get(key)):
                known.append(line.level)
            elif not first:
                other.append(line.level)
        first = False
    levels = known or other
    return min(levels) if levels else 0


def _section_kind(
    line: _Line, extra: dict[str, str] | None, *, first_content: bool, top_level: int = 0
) -> str | None:
    """The section kind this line starts, or None when it is ordinary content."""
    if line.bullet or len(line.text) > 80:
        return None
    key = title_key(line.text)
    if not key:
        return None
    kind = (extra or {}).get(key) or _TITLE_KIND.get(key)
    if kind:
        return kind
    if (
        line.heading
        and not first_content
        and len(key.split()) <= 6
        # A deeper heading (Heading 2 under Heading 1 sections) is an entry title.
        and (not top_level or not line.level or line.level <= top_level)
    ):
        return "custom"
    return None


def _display_title(text: str) -> str:
    title = re.sub(r"[:\s]+$", "", text).strip()
    if title.isupper():
        words = title.lower().split()
        return " ".join(
            word if (index and word in {"and", "of", "&"}) else word.capitalize()
            for index, word in enumerate(words)
        )
    return title


def _bullet_text(text: str) -> str:
    return _BULLET_MARKER.sub("", text, count=1).strip()


def lines_from_text(text: str) -> list[_Line]:
    lines: list[_Line] = []
    pending_marker = False
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if _BULLET_MARKER.match(stripped) and not _bullet_text(stripped):
            pending_marker = True  # a PDF often puts the "•" on a line of its own
            continue
        is_bullet = pending_marker or bool(_BULLET_MARKER.match(stripped))
        pending_marker = False
        lines.append(_Line(_bullet_text(stripped) if is_bullet else stripped, bullet=is_bullet))
    return lines


def split_sections(
    lines: list[_Line],
    extra_headings: dict[str, str] | None = None,
    *,
    keep_empty: bool = False,
) -> tuple[list[_Line], list[tuple[str, str, list[_Line]]]]:
    """Lines before the first heading, then ``(kind, title, lines)`` per heading."""
    preamble: list[_Line] = []
    sections: list[tuple[str, str, list[_Line]]] = []
    seen_content = False
    top_level = _top_heading_level(lines, extra_headings)
    for line in lines:
        if not line.text.strip():
            continue
        kind = _section_kind(
            line, extra_headings, first_content=not seen_content, top_level=top_level
        )
        seen_content = True
        if kind:
            sections.append((kind, _display_title(line.text), []))
        elif sections:
            sections[-1][2].append(line)
        else:
            preamble.append(line)
    if not keep_empty:
        sections = [section for section in sections if section[2]]
    return preamble, sections


def _contact_tokens(text: str) -> tuple[dict, str]:
    """Pull email / phone / links out of ``text``; the rest is a location candidate."""
    found: dict = {"email": None, "phone": None, "links": []}
    remainder = _CONTACT_LABEL.sub("", text.strip())

    def take(pattern, key):
        nonlocal remainder
        for match in pattern.finditer(remainder):
            token = match.group().strip(" ,;|·•()")
            if key == "links":
                found["links"].append(token)
            elif found[key] is None:
                found[key] = token
        remainder = pattern.sub(" ", remainder)

    take(_EMAIL, "email")
    take(_URL, "links")
    for match in list(_PHONE.finditer(remainder)):
        digits = re.sub(r"\D", "", match.group())
        if 7 <= len(digits) <= 15 and not _DATE_ONLY.match(match.group().strip()):
            if found["phone"] is None:
                found["phone"] = match.group().strip()
            remainder = remainder.replace(match.group(), " ", 1)
    remainder = re.sub(r"\s*[|·•●;]+\s*", " | ", remainder)
    parts = [re.sub(r"\s+", " ", part).strip(" ,;()-") for part in remainder.split("|")]
    return found, ", ".join(part for part in parts if part)


_MAX_HEADER_LINE = 300
_NAME_PARTICLES = {"van", "von", "de", "der", "den", "da", "di", "del", "la", "le", "bin", "al", "ibn", "ter", "du"}


def _is_contact_line(text: str) -> bool:
    if len(text) > _MAX_HEADER_LINE:
        return False  # a long paragraph is never a contact line (and is costly to scan)
    found, _ = _contact_tokens(text)
    return bool(found["email"] or found["phone"] or found["links"])


_DOCUMENT_BANNERS = {
    "curriculum vitae", "cv", "resume", "résumé", "resume cv", "curriculum vitae cv",
}


def _looks_like_name(text: str, *, next_is_contact: bool) -> bool:
    words = text.split()
    # A name is capitalised words; a lower-case tagline ("Experienced engineer") is not.
    if any(word[0].islower() and word.lower() not in _NAME_PARTICLES for word in words):
        return False
    if not words or len(words) > 6 or len(text) > 60 or re.search(r"[\d@:/]", text):
        return False
    if text.endswith((".", "!", "?", ";")) and not re.search(r"\b[A-Z]\.$", text):
        return False
    if len(words) == 1 and not next_is_contact:
        return False
    return not any(ch in text for ch in "|•·")


def _extract_header(preamble: list[_Line]) -> tuple[dict, list[_Line]]:
    """The candidate's name, headline and contact details from the lines above the
    first section, and whatever is left over."""
    header: dict = {"name": None, "headline": None, "email": None, "phone": None,
                    "location": None, "links": []}
    if not preamble:
        return header, []
    preamble = list(preamble)
    while preamble and title_key(preamble[0].text) in _DOCUMENT_BANNERS:
        preamble.pop(0)  # "Curriculum Vitae" above the name is a title, not the name
    if not preamble:
        return header, []
    first = preamble[0]
    next_contact = len(preamble) > 1 and _is_contact_line(preamble[1].text)
    if first.bullet or not (
        first.title or _looks_like_name(first.text, next_is_contact=next_contact)
    ):
        return header, list(preamble)
    header["name"] = first.text.strip()[:120]
    consumed = 1
    for line in preamble[1:]:
        text = line.text.strip()
        if line.bullet or len(text) > _MAX_HEADER_LINE:
            break
        if _is_contact_line(text):
            found, place = _contact_tokens(text)
            header["email"] = header["email"] or found["email"]
            header["phone"] = header["phone"] or found["phone"]
            header["links"].extend(found["links"])
            if place and header["location"] is None and len(place) <= 80:
                header["location"] = place
        elif header["location"] is None and _PLACE.match(text):
            header["location"] = text
        elif (
            header["headline"] is None
            and len(text) <= 90
            and len(text.split()) <= 12
            and not text.endswith((".", "!", "?"))
        ):
            header["headline"] = text
        else:
            break
        consumed += 1
    header["links"] = list(dict.fromkeys(header["links"]))[:6]
    return header, list(preamble[consumed:])


def _parse_role_header(text: str, following: str | None) -> tuple[dict, bool] | None:
    """``Role, Company (Mar 2021 - Present)`` and its common variants (a trailing
    date range, a tab before the dates, dates on the next line) as entry fields,
    plus whether the dates came from the following line."""
    text = text.strip()
    if not text or len(text) > _MAX_LINE_FOR_ROLE or text.endswith((".", "!", "?")):
        return None
    start = end = None
    rest = None
    next_line = False
    match = _TRAILING_RANGE.match(text)
    if match:
        rest, start, end = match.group("rest"), match.group("start"), match.group("end")
    else:
        single = _TAB_SINGLE.match(text) or _PAREN_SINGLE.match(text)
        if single:
            rest, start = single.group("rest"), single.group("single")
        elif following and len(following) <= 60:
            date_line = _DATE_ONLY.match(following.strip())
            if date_line:
                rest = text
                start = date_line.group("start") or date_line.group("single")
                end = date_line.group("end")
                next_line = True
    if rest is None or start is None:
        return None
    rest = re.sub(r"[\s,|–—:@·-]+$", "", rest).strip()
    if (
        not rest
        or len(rest.split()) > 16
        or _DATE_ONLY.match(rest)
        or re.fullmatch(_MONTH, rest, re.IGNORECASE)
    ):
        return None
    split = _HEAD_SPLIT.match(rest)
    heading, subheading = (split.group("h"), split.group("s")) if split else (rest, None)
    fields = {"heading": heading.strip()[:200], "start_date": start.strip()[:40]}
    if subheading and subheading.strip():
        fields["subheading"] = subheading.strip()[:200]
    if end:
        fields["end_date"] = end.strip()[:40]
    return fields, next_line


def _heading_only_role(text: str) -> dict | None:
    """A short title line directly above bullets (``Senior Engineer at Example Corp``)."""
    text = text.strip()
    if not text or len(text.split()) > 14 or text.endswith((".", "!", "?", ":")) or "%" in text:
        return None
    split = _HEAD_SPLIT.match(text)
    heading, subheading = (split.group("h"), split.group("s")) if split else (text, None)
    fields = {"heading": heading.strip()[:200]}
    if subheading and subheading.strip():
        fields["subheading"] = subheading.strip()[:200]
    return fields


_SCHOOL_WORD = re.compile(r"\b(?:university|college|school|institute|academy|universität)\b", re.IGNORECASE)


def _three_line_role(kind: str, text: str, ahead: list[_Line]) -> tuple[dict, int] | None:
    """``Senior Engineer`` / ``Stripe`` / ``Jan 2020 – Dec 2023`` on three lines (a
    common PDF extraction): title, organisation and a date line."""
    if len(ahead) < 2 or not (_short_title_line(text) and _short_title_line(ahead[0].text)):
        return None
    if ahead[0].bullet or ahead[1].bullet:
        return None
    dates = _DATE_ONLY.match(ahead[1].text.strip())
    if not dates or len(ahead[1].text) > 60 or _DATE_ONLY.match(ahead[0].text.strip()):
        return None
    first, second = text.strip(), ahead[0].text.strip()
    if kind == "education" and _SCHOOL_WORD.search(first) and not _SCHOOL_WORD.search(second):
        first, second = second, first  # degree first, school second
    fields = {"heading": first[:200], "subheading": second[:200],
              "start_date": (dates.group("start") or dates.group("single"))[:40]}
    if dates.group("end"):
        fields["end_date"] = dates.group("end")[:40]
    return fields, 2


def _short_title_line(text: str) -> bool:
    text = text.strip()
    return bool(text) and len(text.split()) <= 8 and not text.endswith((".", "!", "?", ":", ";"))


def _looks_like_location(text: str) -> bool:
    words = text.split()
    if not words or len(words) > 4 or len(text) > 40 or re.search(r"\d|[.!?]$", text):
        return False
    return bool(_PLACE.match(text)) or text.lower() in {"remote", "hybrid", "on-site", "onsite"} or (
        len(words) <= 2 and all(word[:1].isupper() for word in words)
    )


def _finish_role(role: dict, warnings: list[str]) -> dict:
    description = role.pop("description")
    bullets = role.pop("bullets")
    if bullets and description:
        if len(description) == 1 and _looks_like_location(description[0]):
            role["location"] = description[0][:200]
        else:
            bullets = description + bullets
        description = []
    kept: list[str] = []
    used = 0
    for bullet in bullets[:MAX_BULLETS]:
        room = MAX_BODY_CHARS - used - (1 if kept else 0)
        if room <= 0:
            break
        kept.append(bullet[:room])
        used += len(kept[-1]) + (1 if len(kept) > 1 else 0)
    if kept != bullets:
        warnings.append("Some bullets were shortened or left out to fit the size limit.")
    bullets = kept
    if bullets:
        role["bullets"] = bullets
        role["body"] = "\n".join(bullets)
    elif description:
        role["body"] = " ".join(description)[:MAX_BODY_CHARS]
    else:
        role["body"] = role["heading"]
    return role


def _build_entries(
    kind: str, lines: list[_Line], *, wraps: bool, warnings: list[str]
) -> list[dict]:
    """Entries for one section. Role-capable sections fold the lines that follow a
    role header (bullets, description) into that one entry."""
    entries: list[dict] = []
    role: dict | None = None

    def close():
        nonlocal role
        if role is not None:
            entries.append(_finish_role(role, warnings))
            role = None

    role_capable = kind in _ROLE_SECTIONS
    index = 0
    while index < len(lines):
        line = lines[index]
        text = line.text.strip()
        following = lines[index + 1] if index + 1 < len(lines) else None
        index += 1
        if line.bullet:
            if role is not None:
                role["bullets"].append(text)
                role["last_bullet"] = True
            else:
                entries.append({"body": text})
            continue
        if role_capable:
            parsed = _parse_role_header(text, following.text if following else None)
            if parsed is not None:
                fields, used_next_line = parsed
                index += used_next_line
                close()
                role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                continue
            three = _three_line_role(kind, text, lines[index : index + 2])
            if three is not None:
                fields, used = three
                index += used
                close()
                role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                continue
            if line.heading:
                # A Word heading below the section level names an entry (a job title).
                fields = _heading_only_role(text)
                if fields is not None:
                    if following is not None and not following.bullet and (
                        date_line := _DATE_ONLY.match(following.text.strip())
                    ):
                        fields["start_date"] = (date_line.group("start") or date_line.group("single"))[:40]
                        if date_line.group("end"):
                            fields["end_date"] = date_line.group("end")[:40]
                        index += 1
                    close()
                    role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                    continue
            if following is not None and following.bullet and kind != "custom" and (
                role is None or (role["last_bullet"] and not wraps)
            ):
                fields = _heading_only_role(text)
                if fields is not None:
                    close()
                    role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                    continue
        if role is not None:
            if wraps and role["last_bullet"] and role["bullets"]:
                role["bullets"][-1] = f"{role['bullets'][-1]} {text}"
            else:
                role["description"].append(text)
                role["last_bullet"] = False
            continue
        entries.append({"body": text})
    close()
    return entries


def _has_metric(body: str) -> bool:
    """A number worth staging as an achievement: dates, links, e-mail and phone
    numbers do not count."""
    probe = _EMAIL.sub(" ", body)
    probe = _URL.sub(" ", probe)
    probe = re.sub(rf"{_MONTH}\s+(?:19|20)\d{{2}}", " ", probe, flags=re.IGNORECASE)
    probe = _YEAR.sub(" ", probe)
    probe = _PHONE.sub(" ", probe)
    return bool(re.search(r"\d", probe))


def _claim_for(section_kind: str, entry: dict) -> dict | None:
    heading = entry.get("heading")
    if heading and section_kind in {"experience", "education"}:
        content = {"title": heading} if section_kind == "experience" else {"degree": heading}
        subheading = entry.get("subheading")
        if subheading:
            content["company" if section_kind == "experience" else "school"] = subheading
        for field in ("start_date", "end_date"):
            if entry.get(field):
                content[field] = entry[field]
        if entry.get("bullets"):
            # Kept with the role so the achievements it lists survive confirming it.
            content["highlights"] = "\n".join(entry["bullets"])[:4_000]
        return {"kind": section_kind, "content": content, "provenance": "imported"}
    body = entry["body"]
    if section_kind == "achievements":
        kind = "achievement"
    elif section_kind in {"skills", "education", "certifications"}:
        kind = _CLAIM_BY_SECTION[section_kind]
    elif _has_metric(body):
        kind = "achievement"
    else:
        kind = _CLAIM_BY_SECTION.get(section_kind)
    if kind is None:
        return None
    return {"kind": kind, "content": {"statement": body[:MAX_BODY_CHARS]}, "provenance": "imported"}


def _structure_lines(
    lines: list[_Line], filename: str, warnings: list[str], *, wraps: bool
) -> CvImportProposal:
    preamble, grouped = split_sections(lines)
    header, leftover = _extract_header(preamble)
    if leftover:
        # Unlabelled opening lines are a summary; fold them into an explicit
        # Summary section instead of producing a second one.
        for kind, _title, content in grouped:
            if kind == "summary":
                content[:0] = leftover
                break
        else:
            grouped.insert(0, ("summary", "Summary", leftover))
    if len(grouped) > MAX_SECTIONS:
        grouped = grouped[:MAX_SECTIONS]
        warnings.append(f"Only the first {MAX_SECTIONS} sections were kept.")
    sections = []
    for section_position, (section_kind, section_title, section_lines) in enumerate(grouped):
        import_entries = []
        built = _build_entries(section_kind, section_lines, wraps=wraps, warnings=warnings)
        if len(built) > MAX_ENTRIES:
            built = built[:MAX_ENTRIES]
            warnings.append(f"Only the first {MAX_ENTRIES} entries of a section were kept.")
        for entry_position, entry in enumerate(built):
            body = entry["body"][:MAX_BODY_CHARS]
            entry.pop("last_bullet", None)
            import_entries.append({
                **entry,
                "id": f"entry-{section_position}-{entry_position}", "body": body,
                "position": entry_position,
                "claim": _claim_for(section_kind, {**entry, "body": body}),
            })
        sections.append({
            "id": f"section-{section_position}-{section_kind}", "kind": section_kind,
            "title": section_title[:120], "visible": True, "position": section_position,
            "entries": import_entries,
        })
    proposal_warnings = list(dict.fromkeys(warnings))
    if not sections:
        proposal_warnings.append("No reviewable sections were detected.")
    return CvImportProposal(
        filename=filename, import_id=str(uuid.uuid4()),
        name=Path(filename).stem or "Imported CV",
        sections=sections, warnings=proposal_warnings, header=header,
    )


def _structure_text(text: str, filename: str, warnings: list[str]) -> CvImportProposal:
    return _structure_lines(lines_from_text(text), filename, warnings, wraps=True)


def _extract_pdf(content: bytes) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=content, filetype="pdf")
    try:
        if doc.needs_pass:
            raise CvParserRejected("Encrypted PDFs are not supported")
        if doc.page_count > MAX_PDF_PAGES:
            raise CvParserRejected("PDF page limit exceeded")
        pages = _bounded_text_parts(page.get_text() for page in doc)
    finally:
        doc.close()
    return "\n".join(pages)


def _extract_docx(content: bytes) -> str:
    return "\n".join(line.text for line in _docx_lines(content))


def _clean_docx_lines(lines: list[_Line]) -> list[_Line]:
    """Drop empty paragraphs; a typed bullet marker in a paragraph counts as a list item."""
    cleaned = []
    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        typed = bool(_BULLET_MARKER.match(text))
        cleaned.append(
            _Line(
                _bullet_text(text) if typed else text,
                line.heading,
                line.title,
                line.bullet or typed,
                line.level,
            )
        )
    return cleaned


def _docx_lines(content: bytes) -> list[_Line]:
    """Paragraphs in document order (table cells included) with the structure Word
    records: heading and title styles, and list paragraphs."""
    import io

    from docx import Document
    from docx.table import Table

    with io.BytesIO(content) as buffer:
        doc = Document(buffer)
        blocks = list(doc.iter_inner_content())
        if not blocks:
            blocks = list(doc.paragraphs)
        paragraphs = []
        for block in blocks:
            if isinstance(block, Table):
                paragraphs.extend(
                    paragraph for row in block.rows for cell in row.cells for paragraph in cell.paragraphs
                )
            else:
                paragraphs.append(block)
        lines = [_docx_line(paragraph) for paragraph in paragraphs]
    _bounded_text_parts(line.text for line in lines)
    return lines


def _docx_line(paragraph) -> _Line:
    raw_style = getattr(paragraph.style, "name", "") or ""
    style = raw_style.lower() if isinstance(raw_style, str) else ""
    properties = paragraph._p.pPr
    numbered = properties is not None and properties.numPr is not None
    level_match = re.match(r"heading\s*(\d+)", style)
    return _Line(
        paragraph.text,
        heading=style.startswith("heading"),
        title=style == "title",
        bullet=numbered or style.startswith("list"),
        level=int(level_match.group(1)) if level_match else 0,
    )


def _bounded_text_parts(parts) -> list[str]:
    bounded: list[str] = []
    chars_count = 0
    for part in parts:
        chars_count += len(part)
        if bounded:
            chars_count += 1
        if chars_count > MAX_EXTRACTED_CHARS:
            raise CvParserRejected("Extracted text limit exceeded")
        bounded.append(part)
    return bounded
