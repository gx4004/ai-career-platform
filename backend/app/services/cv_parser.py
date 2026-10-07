import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.schemas.cv_documents import CvImportProposal
from app.schemas.evidence_profile import MAX_CONTENT_VALUE_CHARS
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
    gap_before: bool = False  # a blank line (or empty paragraph) came right before it


_BULLET_MARKER = re.compile(r"^(?:[•◦▪▫●○■□·∙‣⁃*➢➤►▶✓✔❖◆◇–—-])(?:\s+|$)|^[•◦▪▫●○■□∙‣⁃➢➤►▶✓✔❖◆◇]")
_MAX_LINE_FOR_ROLE = 200

# Months in English, Russian and Ukrainian (full names, abbreviations, genitive forms).
_MONTH = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|"
    r"Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
    r"|янв(?:арь|аря)?|фев(?:р(?:аль|аля)?)?|мар(?:т|та)?|апр(?:ель|еля)?|ма[йя]|июн[ья]?"
    r"|июл[ья]?|авг(?:уст|уста)?|сен(?:т(?:ябрь|ября)?)?|окт(?:ябрь|ября)?|ноя(?:брь|бря)?"
    r"|дек(?:абрь|абря)?"
    r"|січ(?:ень|ня)?|лют(?:ий|ого)?|бер(?:езень|езня)?|кві(?:тень|тня)?|тра(?:вень|вня)?"
    r"|чер(?:вень|вня)?|лип(?:ень|ня)?|сер(?:пень|пня)?|вер(?:есень|есня)?|жов(?:тень|тня)?"
    r"|лис(?:топад|топада)?|гру(?:день|дня)?)\.?"
)
_YEAR4 = r"(?:19|20)\d{2}"
_DATE = (
    rf"(?<![\w/.])(?:(?:{_MONTH})\s*)?{_YEAR4}(?:\s?г(?:ода|\.)?)?(?!\d)"
    rf"|(?<![\w/.])\d{{1,2}}\s*[/.]\s*{_YEAR4}(?!\d)"
    rf"|(?<![\w/.])\d{{1,2}}[/.]\d{{1,2}}[/.]{_YEAR4}(?!\d)"
)
_PRESENT = (
    r"Present|Current(?:ly)?|Now|Today|Ongoing|to\s+date|till\s+date|"
    r"настоящее\s+время|наст\.?\s*время|наст\.?\s*вр\.?|н\.\s?в\.?|сейчас|по\s+сегодня|"
    r"текущее\s+время|теперішній\s+час|тепер|дотепер|досі|наш\s+час"
)
_END = rf"(?:{_DATE}|(?<!\w)(?:{_PRESENT})(?!\w))"
_SEP = r"\s*(?:[–—‒−-]+|\bto\b|\buntil\b|\btill\b|\bthrough\b|\bпо\b|\bдо\b)\s*"
_RANGE = rf"(?:(?:с|з|from|since)\s+)?(?P<start>{_DATE}){_SEP}(?P<end>{_END})"
_TRAILING_RANGE = re.compile(
    rf"^(?P<rest>.+?)[\s,|·•:–—-]*[(\[]?\s*{_RANGE}\s*[)\]]?\s*$", re.IGNORECASE
)
_LEADING_RANGE = re.compile(
    rf"^[(\[]?\s*{_RANGE}\s*[)\]]?[\s,|·•:–—-]*(?P<rest>\S.*)$", re.IGNORECASE
)
_DATE_ONLY = re.compile(rf"^[(\[]?\s*(?:{_RANGE}|(?P<single>{_DATE}))\s*[)\]]?$", re.IGNORECASE)
_TAB_SINGLE = re.compile(rf"^(?P<rest>.+?)\t+\s*(?P<single>{_DATE})\s*$", re.IGNORECASE)
_PAREN_SINGLE = re.compile(rf"^(?P<rest>.+?)\s*\(\s*(?P<single>{_DATE})\s*\)\s*$", re.IGNORECASE)
_BAR_SINGLE = re.compile(rf"^(?P<rest>.+?)\s*[|·]\s*(?P<single>{_DATE})\s*$", re.IGNORECASE)
_STRONG_SPLIT = re.compile(r"\s+[–—|@-]\s+|\s*[|·]\s*|\s+at\s+|\t+")
_COMMA_SPLIT = re.compile(r"\s*,\s*")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")

_EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(
    # The lookbehind keeps a bare domain anchored to a token start, so a long
    # dotted or hyphenated token cannot be rescanned from every position.
    r"(?:https?://|www\.)\S+|(?<![\w.-])(?:[\w-]+\.)+(?:com|io|dev|me|net|org|co|app|tech|ai)(?:/\S*)?",
    re.IGNORECASE,
)
_PHONE = re.compile(r"(?<![\w/(])\+?\(?\d[\d\s().-]{5,}\d(?!\w)")
_CONTACT_LABEL = re.compile(
    r"^(?:e-?mail|phone|tel|mobile|cell|linkedin|github|portfolio|website|web|location|address)\s*:\s*",
    re.IGNORECASE,
)
_PLACE_PARTICLES = {"of", "de", "la", "le", "del", "da", "do", "den", "der", "upon", "on", "am", "im"}
_REMOTE_WORDS = {
    "remote", "hybrid", "on-site", "onsite", "удалённо", "удаленно", "удалённая работа",
    "віддалено", "гибрид", "гібрид",
}

# Exact (normalised) section titles. Word heading styles also name sections
# outside this list; those become "custom" sections with their own title.
_SECTION_TITLES: dict[str, tuple[str, ...]] = {
    "summary": (
        "summary", "profile", "professional summary", "career summary", "executive summary",
        "personal profile", "personal statement", "professional profile", "objective",
        "career objective", "about", "about me", "summary of qualifications",
        "profile summary", "professional overview", "overview", "introduction", "о себе", "обо мне", "профиль", "цель", "карьерная цель", "краткое резюме", "профессиональное резюме", "краткая информация", "про себе", "мета",
    ),
    "experience": (
        "experience", "work experience", "professional experience", "relevant experience",
        "employment", "employment history", "work history", "career history",
        "professional background", "experience and projects",
        "employment experience", "professional history", "work", "career", "опыт работы", "профессиональный опыт", "опыт", "трудовая деятельность", "места работы", "карьера", "рабочий опыт", "история работы", "досвід роботи", "професійний досвід", "досвід",
    ),
    "achievements": (
        "achievements", "key achievements", "accomplishments", "key accomplishments",
        "selected achievements", "highlights", "career highlights",
        "достижения", "ключевые достижения", "основные достижения", "досягнення",
    ),
    "skills": (
        "skills", "technical skills", "key skills", "core skills", "core competencies",
        "competencies", "skills and tools", "skills and technologies", "technologies",
        "tech stack", "technical expertise", "areas of expertise", "expertise",
        "tools and technologies",
        "skills and tools", "technical proficiency", "skills and expertise", "навыки", "ключевые навыки", "профессиональные навыки", "технические навыки", "компетенции", "ключевые компетенции", "технологии", "стек технологий", "стек", "навички", "ключові навички", "технічні навички",
    ),
    "education": (
        "education", "education and training", "academic background", "educational background",
        "academic qualifications",
        "education and qualifications", "образование", "образование и обучение", "академическое образование", "высшее образование", "освіта",
    ),
    "projects": (
        "projects", "selected projects", "personal projects", "side projects", "key projects",
        "open source", "open source contributions",
        "notable projects", "проекты", "избранные проекты", "личные проекты", "проєкти", "проекти",
    ),
    "certifications": (
        "certifications", "certificates", "licenses and certifications",
        "licences and certifications", "professional certifications",
        "certifications and licenses",
        "certificates and courses", "certifications and courses", "сертификаты", "сертификация", "сертификаты и курсы", "курсы и сертификаты", "сертифікати",
    ),
    "custom": (
        "languages", "volunteering", "volunteer experience", "volunteer work", "publications",
        "awards", "awards and honors", "honors", "interests", "hobbies", "hobbies and interests",
        "references", "training", "courses", "additional information", "additional",
        "extracurricular activities", "activities", "talks", "speaking",
        "internships", "interests and hobbies", "языки", "знание языков", "владение языками", "иностранные языки", "интересы", "хобби", "увлечения", "дополнительно", "дополнительная информация", "публикации", "награды", "волонтёрство", "волонтерство", "волонтерский опыт", "рекомендации", "курсы", "обучение", "мови", "інтереси", "додатково",
    ),
}
_TITLE_KIND = {
    title.replace("ё", "е"): kind for kind, titles in _SECTION_TITLES.items() for title in titles
}
# "Technical Skills: Go, Rust, SQL" on one line: a section title and its content.
_INLINE_SECTION = re.compile(r"^(?P<title>[A-Za-zА-Яа-яЁёІіЇїЄє][A-Za-zА-Яа-яЁёІіЇїЄє &/]{1,40}?)\s*:\s*(?P<values>\S.*)$")
_INLINE_SECTION_KINDS = {"skills", "certifications", "custom"}
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
    text = text.lower().replace("ё", "е").replace("&", " and ")
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


_ODD_SPACES = str.maketrans({c: " " for c in "\u00a0\u2007\u2009\u200a\u202f\u2002\u2003\u2005"})
_INVISIBLE = str.maketrans("", "", "\u200b\u200c\u200d\u2060\ufeff\u00ad")


def _tidy(text: str) -> str:
    return text.translate(_ODD_SPACES).translate(_INVISIBLE)


def lines_from_text(text: str) -> list[_Line]:
    lines: list[_Line] = []
    pending_marker = False
    gap = False
    for raw in _tidy(text).splitlines():
        stripped = raw.strip()
        if not stripped:
            gap = bool(lines)
            continue
        if _BULLET_MARKER.match(stripped) and not _bullet_text(stripped):
            pending_marker = True  # a PDF often puts the "•" on a line of its own
            continue
        is_bullet = pending_marker or bool(_BULLET_MARKER.match(stripped))
        pending_marker = False
        lines.append(
            _Line(_bullet_text(stripped) if is_bullet else stripped, bullet=is_bullet, gap_before=gap)
        )
        gap = False
    return lines


def _inline_section(line: _Line, extra: dict[str, str] | None, *, current: str | None):
    """``(kind, title, values)`` for a "Skills: Go, Rust" line that starts its own section.

    Before any heading it always does. Inside a Skills section never: "Languages: Go,
    Python" there is one group of that section's skills. Elsewhere only after a blank
    line: a role's own "Technologies: ..." line directly under its bullets stays with it.
    """
    if current == "skills" or (current is not None and not line.gap_before):
        return None
    if line.bullet or len(line.text) > _MAX_HEADER_LINE:
        return None
    match = _INLINE_SECTION.match(line.text.strip())
    if not match:
        return None
    key = title_key(match.group("title"))
    kind = (extra or {}).get(key) or _TITLE_KIND.get(key)
    if kind not in _INLINE_SECTION_KINDS:
        return None
    return kind, _display_title(match.group("title")), match.group("values").strip()


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
        inline = _inline_section(line, extra_headings, current=sections[-1][0] if sections else None)
        if inline:
            kind, title, values = inline
            sections.append((kind, title, [_Line(values)]))
            seen_content = True
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


def _contact_tokens(text: str) -> tuple[dict, list[str]]:
    """Pull email / phone / links out of ``text``; the other segments are returned as they are."""
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
    parts = [_trim_segment(part) for part in remainder.split("|")]
    return found, [part for part in parts if part]


def _trim_segment(part: str) -> str:
    """Collapse spaces and trim separators; a bracket is trimmed only when it is left
    unpaired, so "Remote (EU)" keeps its closing one."""
    part = re.sub(r"\s+", " ", part).strip(" ,;-")
    if part.count("(") != part.count(")"):
        part = part.strip(" ,;()-")
    return part


_MAX_HEADER_LINE = 300
_ONE_LINE_SPLIT = re.compile(r"\s+[|·•●]\s+|\s+[–—-]\s+|\s*,\s+")
_NAME_PARTICLES = {"van", "von", "de", "der", "den", "da", "di", "del", "la", "le", "bin", "al", "ibn", "ter", "du"}


def _is_contact_line(text: str) -> bool:
    if len(text) > _MAX_HEADER_LINE:
        return False  # a long paragraph is never a contact line (and is costly to scan)
    found, _ = _contact_tokens(text)
    return bool(found["email"] or found["phone"] or found["links"])


_DOCUMENT_BANNERS = {
    "curriculum vitae", "cv", "resume", "résumé", "resume cv", "curriculum vitae cv", "резюме",
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


def _join_wrapped_links(lines: list[_Line]) -> list[_Line]:
    """A link the page wrapped at a hyphen or slash ("linkedin.com/in/maya-" / "lindqvist")."""
    joined: list[_Line] = []
    for line in lines:
        text = line.text.strip()
        if (
            joined
            and not line.bullet
            and " " not in text
            and re.search(r"\S[-/]$", joined[-1].text.strip())
            and " " not in joined[-1].text.strip().split("|")[-1].strip()
            and _URL.search(joined[-1].text)
        ):
            joined[-1] = _Line(joined[-1].text.strip() + text, gap_before=joined[-1].gap_before)
        else:
            joined.append(line)
    return joined


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
    one_line = False
    if not first.bullet and not first.title and _is_contact_line(first.text):
        # One-line header: "Maya Lindqvist | Amsterdam | maya@example.com | +31 6 1234 5678".
        pieces = _ONE_LINE_SPLIT.split(first.text.strip(), maxsplit=1)
        if len(pieces) == 2 and _looks_like_name(pieces[0], next_is_contact=True):
            header["name"] = pieces[0].strip()[:120]
            preamble[0] = _Line(pieces[1], gap_before=first.gap_before)
            one_line = True
    if not one_line:
        if first.bullet or not (
            first.title or _looks_like_name(first.text, next_is_contact=next_contact)
        ):
            return header, list(preamble)
        header["name"] = first.text.strip()[:120]
    consumed = 0 if one_line else 1
    preamble[:] = _join_wrapped_links(preamble)
    monogram = {w[:1].upper() for w in re.split(r"[\s-]+", header["name"] or "") if w}
    for line in preamble[consumed:]:
        text = line.text.strip()
        if line.bullet or len(text) > _MAX_HEADER_LINE:
            break
        if 2 <= len(text) <= 3 and text.isalpha() and text.isupper() and set(text) <= monogram:
            consumed += 1  # the initials a template prints in its photo slot
            continue
        if _is_contact_line(text):
            found, parts = _contact_tokens(text)
            header["email"] = header["email"] or found["email"]
            header["phone"] = header["phone"] or found["phone"]
            header["links"].extend(found["links"])
            # A job title on the contact line ("... | Senior Engineer") is the
            # headline; every other segment is part of the location.
            titles = [part for part in parts if _reads_as_role(part)]
            place = ", ".join(part for part in parts if not _reads_as_role(part))
            if place and header["location"] is None and len(place) <= 80:
                header["location"] = place
            if titles and header["headline"] is None and len(titles[0]) <= 90:
                header["headline"] = titles[0]
        elif header["location"] is None and _place_like(text):
            header["location"] = text
        elif (
            header["headline"] is None
            and len(text) <= 90
            and len(text.split()) <= 12
            and not text.endswith((".", "!", "?"))
        ):
            header["headline"] = text
        elif (
            header["headline"]
            and len(text.split()) <= 4
            and _reads_as_role(text)
            and not _reads_as_role(header["headline"])
        ):
            header["headline"] = f"{header['headline']} {text}"  # the page wrapped the headline
        else:
            break
        consumed += 1
    header["links"] = list(dict.fromkeys(header["links"]))[:6]
    return header, list(preamble[consumed:])


_ORG_WORDS = frozenset(
    {
        "inc", "ltd", "llc", "gmbh", "b.v", "bv", "corp", "corporation", "co", "company", "group",
        "labs", "lab", "systems", "solutions", "technologies", "bank", "studio", "agency", "partners",
        "foundation", "university", "college", "school", "institute", "ag", "plc", "sa", "oy", "ab",
        "ооо", "ао", "зао", "пао", "ип", "компания", "университет", "институт", "школа", "банк",
    }
)  # fmt: skip
_ROLE_STEMS = (
    "инженер", "разработчик", "программист", "менеджер", "аналитик", "дизайнер", "руководител",
    "директор", "специалист", "архитектор", "консультант", "стажер", "стажёр", "преподавател",
    "тестировщик", "администратор", "координатор", "ассистент", "помощник", "основател",
    "редактор", "бухгалтер", "учител", "врач", "юрист", "маркетолог", "продавец", "лидер",
    "технолог", "исследовател", "розробник", "інженер", "менеджер", "аналітик", "керівник",
)  # fmt: skip
_DEGREE_WORDS = frozenset(
    {
        "bsc", "msc", "ba", "ma", "mba", "phd", "bachelor", "bachelors", "master", "masters",
        "diploma", "degree", "doctorate", "бакалавр", "магистр", "магистратура", "бакалавриат",
        "специалитет", "аспирантура", "бакалавр.", "диплом",
    }
)  # fmt: skip


def _words(text: str) -> list[str]:
    return [w.strip(",.()[]:;").lower() for w in text.split()]


def _has_org_word(text: str) -> bool:
    return any(w in _ORG_WORDS for w in _words(text)) or bool(re.search(r"\bB\.V\.|\bInc\.|\bLtd\.", text))


def _has_degree_word(text: str) -> bool:
    return any(w in _DEGREE_WORDS for w in _words(text))


def _is_capitalised(word: str) -> bool:
    word = word.strip("(\"'“«")
    if any(piece[:1].islower() for piece in word.split("-")[1:]):
        return False  # "Product-minded" is a word of a sentence, "Saint-Étienne" a place
    return bool(word) and (word[0].isupper() or word.lower() in _PLACE_PARTICLES)


def _place_like(text: str) -> bool:
    """A city, region or country, optionally comma separated ("Amsterdam, NL"), or Remote."""
    text = text.strip()
    if not text or len(text) > 60 or re.search(r"\d|[.!?:;]$", text):
        return False
    base = re.sub(r"\s*\([^)]*\)\s*$", "", text).strip().lower()
    if base in _REMOTE_WORDS:
        return True
    parts = [part for part in _COMMA_SPLIT.split(text) if part]
    if not 1 <= len(parts) <= 3 or _reads_as_role(text):
        return False
    for part in parts:
        words = part.split()
        if not 1 <= len(words) <= 4 or not all(_is_capitalised(w) for w in words):
            return False
        if _has_org_word(part):
            return False
    return len(parts) > 1 or len(parts[0].split()) <= 2


def _analyse(text: str) -> tuple[str, str | None, str | None]:
    """``(rest, start, end)``: the date range or single date a line carries and the text
    around it. ``start`` is None when the line has no date."""
    text = text.strip()
    only = _DATE_ONLY.match(text)
    if only:
        return "", (only.group("start") or only.group("single")), only.group("end")
    for pattern in (_TRAILING_RANGE, _LEADING_RANGE):
        found = pattern.match(text)
        if found:
            return found.group("rest").strip(), found.group("start"), found.group("end")
    for pattern in (_TAB_SINGLE, _PAREN_SINGLE, _BAR_SINGLE):
        found = pattern.match(text)
        if found:
            return found.group("rest").strip(), found.group("single"), None
    return text, None, None


def _clean_rest(rest: str) -> str:
    return re.sub(r"^[\s,|–—:@·-]+|[\s,|–—:@·-]+$", "", rest).strip()


def _split_commas(rest: str) -> list[str]:
    """``Role, Company`` as two parts. A role that has a comma of its own ("Staff Engineer,
    Payments, Tulip Pay B.V.") splits at the company, found by its legal suffix, else a
    trailing place."""
    pieces = [piece for piece in _COMMA_SPLIT.split(rest) if piece]
    if len(pieces) <= 2:
        return pieces
    org_at = max((i for i, piece in enumerate(pieces) if _has_org_word(piece) and i > 0), default=None)
    if org_at is not None:
        head = ", ".join(pieces[:org_at])
        tail = pieces[org_at:]
        return [head, ", ".join(tail)]
    if len(pieces) == 3 and _place_like(pieces[2]):
        return pieces
    return [pieces[0], ", ".join(pieces[1:])]


def _split_org(rest: str, kind: str) -> dict:
    """``Role — Company | Amsterdam`` (or company first) as heading, subheading and location."""
    parts = [part.strip() for part in _STRONG_SPLIT.split(rest) if part and part.strip()]
    if len(parts) == 1:
        parts = _split_commas(rest)
    fields: dict = {"heading": parts[0]}
    if len(parts) > 1:
        tail = parts[1:]
        location = None
        if len(tail) > 1 and _place_like(tail[-1]):
            location = tail.pop()
        org = " — ".join(tail)
        # "Tulip Pay, Amsterdam": a company followed by its city.
        inner = _COMMA_SPLIT.split(org, maxsplit=1)
        if location is None and len(inner) == 2 and _place_like(inner[1]) and not _has_org_word(inner[1]):
            org, location = inner
        fields["subheading"] = org
        if location:
            fields["location"] = location
    return _order_pair(fields, kind)


def _order_pair(fields: dict, kind: str) -> dict:
    """Put the role (or degree) in ``heading`` and the company (or school) in ``subheading``
    when the file wrote them the other way round."""
    first, second = fields.get("heading"), fields.get("subheading")
    if not first or not second:
        return fields
    if kind == "education":
        swap = (_SCHOOL_WORD.search(first) and not _SCHOOL_WORD.search(second)) or (
            _has_degree_word(second) and not _has_degree_word(first)
        )
    else:
        role_first, role_second = _reads_as_role(first), _reads_as_role(second)
        swap = (role_second and not role_first) or (
            _has_org_word(first) and not _has_org_word(second) and not role_first
        )
    if swap:
        fields["heading"], fields["subheading"] = second, first
    return fields


def _date_fields(start: str | None, end: str | None) -> dict:
    fields: dict = {}
    if start:
        fields["start_date"] = start.strip()[:40]
    if end:
        fields["end_date"] = end.strip()[:40]
    return fields


def _title_line(text: str) -> bool:
    """A short line that can name a role or an organisation."""
    text = text.strip()
    if not text or len(text.split()) > 12 or len(text) > 120 or text.endswith((":", ";", "!", "?")):
        return False
    if text.endswith(".") and not re.search(r"\b[A-Za-z]{1,3}\.$", text):
        return False
    return not _EMAIL.search(text)


def _location_line(lines: list[_Line], index: int, kind: str) -> str | None:
    """A place on its own line right after an entry's header, when what follows is a
    bullet, the end of the section or the header of the next entry."""
    if index >= len(lines) or lines[index].bullet or lines[index].heading:
        return None
    text = lines[index].text.strip()
    if not _place_like(text) or _analyse(text)[1]:
        return None
    strong = text.lower() in _REMOTE_WORDS or "," in text
    following = lines[index + 1] if index + 1 < len(lines) else None
    if strong or following is None or following.bullet:
        return text
    return text if _read_header(kind, lines, index + 1, allow_location=False) else None


_JOINERS = ("," , "&", "-", "–", "—", "/", "(", " and", " of", " for", " the", " at", " in")


def _wrapped_groups(titles: list[str]) -> list[str]:
    """Title lines of one entry header, with a line the page wrapped joined back: a line
    that ends on a joiner or the next starting lower-case continues it. At most two
    groups come out (title, organisation)."""
    groups: list[str] = []
    for title in titles:
        if groups and (groups[-1].endswith(_JOINERS) or title[:1].islower()):
            groups[-1] = f"{groups[-1]} {title}"
        else:
            groups.append(title)
    if len(groups) > 2:
        groups = [groups[0], " ".join(groups[1:])] if len(groups) == 3 else [
            " ".join(groups[: len(groups) // 2]), " ".join(groups[len(groups) // 2 :])
        ]
    return groups


def _title_block(lines: list[_Line], index: int) -> tuple[list[str], str, int] | None:
    """Two to four title lines followed by a line with the dates:
    ``(titles, date line, lines used)``."""
    titles = [lines[index].text.strip()]
    for offset in range(1, 6):
        if index + offset >= len(lines):
            return None
        line = lines[index + offset]
        text = line.text.strip()
        if line.bullet or not _title_line(text) and not _analyse(text)[1]:
            return None
        if _analyse(text)[1]:
            return (titles, text, offset + 1) if len(titles) >= 2 else None
        titles.append(text)
    return None


def _undated_header(kind: str, text: str, nxt: _Line | None, ahead: list[_Line]) -> dict | None:
    """A header with no dates, recognised by the bullets right below it: ``Role — Company``
    (+ a place line), or two title lines (+ a place line)."""
    if nxt is None or not _title_line(text) or _place_like(text) or _analyse(nxt.text)[1]:
        return None
    third = ahead[1] if len(ahead) > 1 else None
    fourth = ahead[2] if len(ahead) > 2 else None
    separated = bool(_STRONG_SPLIT.search(text) or "," in text)
    nxt_place = _place_like(nxt.text)
    if separated:
        if nxt_place and third is not None and third.bullet:
            return {**_split_org(text, kind), "_one": True}
        return None
    if third is not None and third.bullet and nxt_place and (
        nxt.text.strip().lower() in _REMOTE_WORDS or "," in nxt.text
    ):
        return {"heading": text, "_one": True}  # "Budget Buddy" / "Remote" / bullets
    if kind == "projects" or not _title_line(nxt.text):
        return None
    if third is not None and third.bullet and nxt.text.strip().lower() not in _REMOTE_WORDS:
        return _order_pair({"heading": text, "subheading": nxt.text.strip()}, kind)
    if (
        third is not None
        and not third.bullet
        and _place_like(third.text)
        and fourth is not None
        and fourth.bullet
    ):
        return _order_pair({"heading": text, "subheading": nxt.text.strip()}, kind)
    return None


def _read_header(
    kind: str, lines: list[_Line], index: int, *, allow_location: bool = True
) -> tuple[dict, int] | None:
    """The entry header that starts at ``lines[index]`` as ``(fields, lines used)``.

    Reads ``Role, Company (Mar 2021 - Present)`` and its variants: dates on the same
    line (before or after), role / company / dates / place on separate lines, a place
    next to the dates ("Amsterdam · Mar 2022 – Present"), company first, dates first,
    and two title lines directly above bullets.
    """
    first = lines[index]
    text = first.text.strip()
    if first.bullet or not text or len(text) > _MAX_LINE_FOR_ROLE:
        return None
    ahead = lines[index + 1 : index + 4]
    nxt = ahead[0] if ahead and not ahead[0].bullet else None
    nxt2 = ahead[1] if len(ahead) > 1 and not ahead[1].bullet and nxt is not None else None
    rest, start, end = _analyse(text)
    fields: dict | None = None
    used = 1

    if start and rest:
        rest = _clean_rest(rest)
        if (
            not rest
            or text.endswith((".", "!", "?")) and not _title_line(text)
            or len(rest.split()) > 16
            or re.fullmatch(_MONTH, rest, re.IGNORECASE)
        ):
            return None
        fields = _split_org(rest, kind)
        fields.update(_date_fields(start, end))
    elif start:
        # Dates first: the title lines follow ("Mar 2022 – Present" / "Engineer" / "Acme").
        if nxt is None or not _title_line(nxt.text) or _analyse(nxt.text)[1]:
            return None
        titles = [nxt.text.strip()]
        used = 2
        if nxt2 is not None and _title_line(nxt2.text) and not _analyse(nxt2.text)[1]:
            titles.append(nxt2.text.strip())
            used = 3
        fields = {"heading": titles[0]}
        if len(titles) > 1:
            fields["subheading"] = titles[1]
        fields = _order_pair(fields, kind)
        fields.update(_date_fields(start, end))
    elif nxt is not None and _title_line(text):
        rest1, start1, end1 = _analyse(nxt.text)
        if start1 and len(nxt.text) <= 120:
            used = 2
            fields = _split_org(text, kind) if _STRONG_SPLIT.search(text) else {"heading": text}
            rest1 = _clean_rest(rest1)
            if rest1:
                if _place_like(rest1):
                    fields["location"] = rest1
                elif "subheading" in fields or len(rest1.split()) > 6 or rest1[:1].islower():
                    fields["_description"] = rest1  # "2015 – 2019 · Thesis on ..."
                else:
                    # "Northwind Labs · Rotterdam · Aug 2019 - Feb 2022" under a bare title.
                    parts = [p for p in _STRONG_SPLIT.split(rest1) if p.strip()]
                    fields["subheading"] = parts[0].strip()
                    if len(parts) > 1 and _place_like(parts[-1]):
                        fields["location"] = parts[-1].strip()
                    fields = _order_pair(fields, kind)
            fields.update(_date_fields(start1, end1))
        elif (block := _title_block(lines, index)) is not None:
            titles, dates_line, used = block
            groups = _wrapped_groups(titles)
            fields = {"heading": groups[0]}
            if len(groups) > 1:
                fields["subheading"] = groups[1]
            fields = _order_pair(fields, kind)
            rest_d, start_d, end_d = _analyse(dates_line)
            fields.update(_date_fields(start_d, end_d))
            extra = _clean_rest(rest_d)
            if extra:
                if _place_like(extra):
                    fields["location"] = extra
                else:
                    fields["_description"] = extra
        elif kind in {"experience", "education", "projects"} and _is_capitalised(text.split()[0]):
            fields = _undated_header(kind, text, nxt, ahead)
            used = 2 if fields is not None and "subheading" in fields and "_one" not in fields else 1
            if fields is not None:
                fields.pop("_one", None)
    if fields is None:
        return None
    if allow_location and "location" not in fields:
        place = _location_line(lines, index + used, kind)
        if place:
            fields["location"] = place[:200]
            used += 1
    for key in ("heading", "subheading", "location"):
        if key in fields:
            fields[key] = fields[key].strip()[:200]
    fields = {k: v for k, v in fields.items() if v}
    return (fields, used) if fields.get("heading") else None


def _heading_only_role(text: str) -> dict | None:
    """A short title line directly above bullets (``Senior Engineer at Example Corp``)."""
    text = text.strip()
    if not text or len(text.split()) > 14 or text.endswith((".", "!", "?", ":")) or "%" in text:
        return None
    fields = _split_org(text, "experience") if _STRONG_SPLIT.search(text) or "," in text else {"heading": text}
    return {k: v[:200] for k, v in fields.items()}


_SCHOOL_WORD = re.compile(
    r"\b(?:university|college|school|institute|academy|universität|университет|институт|академия|школа|колледж|училище|університет)\b",
    re.IGNORECASE,
)

_ROLE_WORDS = frozenset(
    {
        "engineer", "developer", "designer", "manager", "analyst", "scientist", "lead", "director",
        "consultant", "architect", "specialist", "officer", "intern", "chef", "nurse", "teacher",
        "administrator", "coordinator", "assistant", "associate", "head", "founder", "writer",
        "programmer", "tester", "owner", "executive", "president", "representative", "technician",
        "strategist", "recruiter", "trainer", "instructor", "professor", "lecturer", "researcher",
        "editor", "producer", "advisor", "adviser", "supervisor", "freelancer", "contractor",
        "accountant", "auditor", "driver", "cook", "clerk", "secretary", "devops", "sre", "qa",
        "cto", "ceo", "cfo", "coo", "vp", "marketer", "paralegal", "lawyer", "attorney", "doctor",
    }
)  # fmt: skip


def _reads_as_role(text: str) -> bool:
    for word in _words(text):
        if word in _ROLE_WORDS or (word[:1] and word[0] > "Ѐ" and word.startswith(_ROLE_STEMS)):
            return True
    return False


def _looks_like_location(text: str) -> bool:
    return _place_like(text) and _analyse(text)[1] is None


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
            continuation = (
                role is not None
                and wraps
                and role["last_bullet"]
                and not line.gap_before
                and text[:1].islower()
            )
            header = None if continuation else _read_header(kind, lines, index - 1)
            if header is not None and role is not None and wraps and role["last_bullet"] and not line.gap_before:
                # In a PDF a bullet that wraps must not be mistaken for the next header: with no
                # dates the header needs a title-case start and a sentence end before it.
                prev = role["bullets"][-1] if role["bullets"] else ""
                if "start_date" not in header[0] and not prev.endswith((".", "!", "?", ")", "%")):
                    header = None
            if header is not None:
                fields, used = header
                index += used - 1
                close()
                description = [fields.pop("_description")] if "_description" in fields else []
                role = {**fields, "bullets": [], "description": description, "last_bullet": False}
                continue
            if line.heading:
                # A Word heading below the section level names an entry (a job title).
                fields = _heading_only_role(text)
                if fields is not None:
                    close()
                    role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                    continue
            if following is not None and following.bullet and kind != "custom" and (
                role is None
                or (role["last_bullet"] and not wraps)
                or (
                    role["last_bullet"]
                    and wraps
                    and _is_capitalised(text.split()[0])
                    and len(text.split()) <= 10
                    and not text.endswith((".", ",", ";", ":"))
                )
            ):
                fields = _heading_only_role(text)
                if fields is not None:
                    close()
                    role = {**fields, "bullets": [], "description": [], "last_bullet": False}
                    continue
        if role is not None:
            if wraps and role["last_bullet"] and role["bullets"] and not line.gap_before:
                role["bullets"][-1] = f"{role['bullets'][-1]} {text}"
            elif wraps and role["last_bullet"] and role["bullets"] and line.gap_before:
                # After a blank line it is a new point, never the end of the last bullet.
                role["bullets"].append(text)
                role["last_bullet"] = True
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
            content["highlights"] = "\n".join(entry["bullets"])[:MAX_CONTENT_VALUE_CHARS]
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
    return {"kind": kind, "content": {"statement": body[:MAX_CONTENT_VALUE_CHARS]}, "provenance": "imported"}


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
    gap = False
    for line in lines:
        text = _tidy(line.text).strip()
        if not text:
            gap = bool(cleaned)
            continue
        typed = bool(_BULLET_MARKER.match(text))
        cleaned.append(
            _Line(
                _bullet_text(text) if typed else text,
                line.heading,
                line.title,
                line.bullet or typed,
                line.level,
                gap_before=gap,
            )
        )
        gap = False
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
        lines = []
        for paragraph in paragraphs:
            line = _docx_line(paragraph)
            pieces = line.text.replace("\v", "\n").split("\n")
            lines.append(_Line(pieces[0], line.heading, line.title, line.bullet, line.level))
            # A soft line break (Shift+Enter) inside a paragraph is a line of its own.
            lines.extend(_Line(piece, level=line.level) for piece in pieces[1:])
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
