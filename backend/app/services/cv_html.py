"""CV templates as HTML: manifests, bundled fonts and the Jinja render of a ``CvRenderModel``.

A template is a directory ``app/cv_templates/<id>/`` holding ``template.html.j2``,
``template.css`` and ``manifest.json``. :func:`render_cv_html` returns one
self-contained HTML string (CSS inlined, fonts as data URIs, ``@page`` size set), which
``cv_chromium`` prints to PDF. Nothing here touches a browser.
"""

from __future__ import annotations

import base64
import functools
import json
import re
import unicodedata
from dataclasses import dataclass
from html import escape
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, pass_context
from markupsafe import Markup

from app.schemas.cv_documents import DEFAULT_CV_TEMPLATE_ID, CvRenderModel
from app.services.cv_fonts import (
    TYPEFACES,
    Face,
    Typeface,
    heading_family,
    needs_glyph,
    override_size_adjust,
    typeface_codepoints,
    typeface_for_name,
)
from app.services.cv_style_tokens import accent_tokens

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "cv_templates"

URL_RE = re.compile(r"https?://[^\s<>()\[\]{}\"']*[^\s<>()\[\]{}\"'.,;:!?]")
_HOSTLIKE_RE = re.compile(r"(https?://)?[\w-]+(\.[\w-]+)+(/\S*)?", re.IGNORECASE)

DEFAULT_TEMPLATE_ID = DEFAULT_CV_TEMPLATE_ID

PAGE_SIZES = {"a4": "A4", "letter": "Letter"}


@dataclass(frozen=True)
class FontFace:
    family: str
    weight: int
    style: str
    file: str


@dataclass(frozen=True)
class TemplateManifest:
    id: str
    name: str
    description: str
    ats_safe: bool
    photo_slot: bool
    columns: int
    typefaces: dict[str, str]
    group: str
    title_align: str
    accent_role: str
    sidebar_kinds: tuple[str, ...]
    margin_top_mm: float
    margin_right_mm: float
    margin_bottom_mm: float
    margin_left_mm: float
    fonts: tuple[FontFace, ...]
    # The accent a template prints with while the style's accent is null (no colour picked);
    # resolved in ``cv_rendering.resolve_effective_style``, so the model's accent is final.
    default_accent: str | None = None
    # Adaptive page balance: the most a short CV's spacing may open up (``--fill``), see
    # ``cv_balance``. A template whose blocks look gappy sooner sets a lower cap.
    balance_max: float = 2.2
    # Sidebar templates: balance measures (and opens up) the main column, the text from this
    # many mm from the left edge; the sidebar keeps its spacing. None: the whole page.
    balance_main_from_mm: float | None = None

    @property
    def families(self) -> frozenset[str]:
        return frozenset(face.family for face in self.fonts)


@functools.cache
def load_manifest(template_id: str) -> TemplateManifest:
    raw = json.loads((TEMPLATES_DIR / template_id / "manifest.json").read_text("utf-8"))
    margin = raw["page_margin_mm"]
    return TemplateManifest(
        id=raw["id"],
        name=raw["name"],
        description=raw["description"],
        ats_safe=raw["ats_safe"],
        photo_slot=raw["photo_slot"],
        columns=raw["columns"],
        typefaces=raw["typefaces"],
        group="ats-safe" if raw["ats_safe"] else "more",
        title_align=raw.get("title_align", "left"),
        accent_role=raw["accent_role"],
        sidebar_kinds=tuple(raw["sidebar_kinds"]),
        margin_top_mm=margin["top"],
        margin_right_mm=margin["right"],
        margin_bottom_mm=margin["bottom"],
        margin_left_mm=margin["left"],
        fonts=tuple(FontFace(**face) for face in raw["fonts"]),
        default_accent=raw.get("default_accent"),
        balance_max=float(raw.get("balance_max", 2.2)),
        balance_main_from_mm=raw.get("balance_main_from_mm"),
    )


@functools.cache
def available_template_ids() -> tuple[str, ...]:
    """Ids of the templates that exist on disk (directory, manifest and Jinja file), in catalog order.

    The catalog is built from this: a template becomes available when its directory is added.
    """
    ids = [
        path.name
        for path in TEMPLATES_DIR.iterdir()
        if (path / "manifest.json").is_file() and (path / "template.html.j2").is_file()
    ]
    return tuple(sorted(ids, key=lambda tid: (not load_manifest(tid).ats_safe, tid != DEFAULT_TEMPLATE_ID, tid)))


def html_template_id(model_template_id: str) -> str:
    """The HTML template that prints a model's template id; one not yet available prints as the default."""
    return model_template_id if model_template_id in available_template_ids() else DEFAULT_TEMPLATE_ID


def nfc(value: str) -> str:
    """Canonical composed form, so "e" + combining acute and "é" read, search and print alike."""
    return unicodedata.normalize("NFC", value)


@dataclass(frozen=True)
class FontPlan:
    """The families a template prints with, and the exact faces it loads for them."""

    body: Typeface
    heading: Typeface
    faces: tuple[tuple[Typeface, int, str, Face], ...]  # family, CSS weight, CSS style, file

    @property
    def families(self) -> frozenset[str]:
        return frozenset({self.body.name, self.heading.name})


@functools.cache
def font_plan(template_id: str, font_override: str | None = None) -> FontPlan:
    """Body and heading families, and the @font-face set, for a template and typeface override.

    Rule (docs/cv-templates-spec.md 3.4): the override replaces the body family; it also
    replaces the heading family when that is the same category (serif/sans) as the override,
    so a template keeps its serif or sans headings under an override of the other kind.
    Each role keeps the (weight, style) pairs the template's manifest uses for its own
    family; the override family supplies its nearest shipped real face for each pair, declared
    under the pair the CSS asks for, so Chromium never synthesises a weight or an italic.
    """
    manifest = load_manifest(template_id)
    override = TYPEFACES.get(font_override) if font_override else None
    default = {role: typeface_for_name(name) for role, name in manifest.typefaces.items()}
    body = override or default["body"]
    heading = heading_family(manifest.typefaces["heading"], override)
    used = {
        role: sorted({(f.weight, f.style) for f in manifest.fonts if f.family == family.name})
        for role, family in default.items()
    }
    faces: dict[tuple[str, int, str], tuple[Typeface, int, str, Face]] = {}
    for role, family in (("body", body), ("heading", heading)):
        for weight, style in used[role]:
            faces.setdefault(
                (family.id, weight, style), (family, weight, style, family.face(weight, style))
            )
    return FontPlan(body, heading, tuple(faces.values()))


def effective_families(template_id: str, font_override: str | None = None) -> frozenset[str]:
    """The family names a PDF of this template may embed (everything else is a fallback)."""
    return font_plan(template_id, font_override).families


@functools.cache
def _covered_codepoints(template_id: str, font_override: str | None) -> frozenset[int]:
    """Codepoints every face the template loads can draw (a gap in any weight is a gap)."""
    covered: frozenset[int] | None = None
    for _family, _weight, _style, face in font_plan(template_id, font_override).faces:
        points = typeface_codepoints(face.file)
        covered = points if covered is None else covered & points
    return covered or frozenset()


def missing_characters(template_id: str, text: str, font_override: str | None = None) -> list[str]:
    """Characters in ``text`` the template's loaded fonts cannot draw, once each."""
    covered = _covered_codepoints(template_id, font_override)
    return list(dict.fromkeys(c for c in text if needs_glyph(c) and ord(c) not in covered))


@functools.cache
def _font_face_css(template_id: str, font_override: str | None = None) -> str:
    rules = []
    override = TYPEFACES.get(font_override) if font_override else None
    own_body = typeface_for_name(load_manifest(template_id).typefaces["body"])
    for family, weight, style, face in font_plan(template_id, font_override).faces:
        data = base64.b64encode(face.path.read_bytes()).decode("ascii")
        adjust = override_size_adjust(own_body, family) if family == override else 1.0
        size = f"size-adjust: {adjust * 100:g}%; " if adjust != 1.0 else ""
        rules.append(
            f'@font-face {{ font-family: "{family.name}"; font-weight: {weight}; '
            f"font-style: {style}; {size}"
            f'src: url("data:font/ttf;base64,{data}") format("truetype"); }}'
        )
    return "\n".join(rules)


@functools.cache
def _template_css(template_id: str) -> str:
    return (TEMPLATES_DIR / template_id / "template.css").read_text("utf-8")


@functools.cache
def _base_css() -> str:
    return (TEMPLATES_DIR / "_base.css").read_text("utf-8")


_GENERIC = {"sans-serif": "sans-serif", "serif": "serif", "monospace": "monospace"}


def _stack(family: Typeface) -> str:
    return f'"{family.name}", {_GENERIC[family.category]}'


# Page balance: how much of the spacing growth the header and in-entry gaps take (--fill-soft),
# the page's top and bottom margins take, and the extra line height at the cap.
SOFT_SHARE = 0.5
MARGIN_SHARE = 0.3
MAX_LEAD = 0.2
LEAD_PER_FILL = 1 / 6


def balance_vars(fill: float) -> dict[str, float]:
    """The custom properties a page balance ``fill`` (>= 1) sets; empty at 1 (nothing changes)."""
    if fill <= 1:
        return {}
    return {
        "fill": round(fill, 4),
        "fill-soft": round(1 + (fill - 1) * SOFT_SHARE, 4),
        "lead": round(min(MAX_LEAD, (fill - 1) * LEAD_PER_FILL), 4),
    }


def balanced_margin_mm(margin_mm: float, fill: float) -> float:
    """A top or bottom page margin under page balance (sides never move)."""
    return margin_mm if fill <= 1 else round(margin_mm * (1 + (fill - 1) * MARGIN_SHARE), 2)


def _root_vars(
    plan: FontPlan,
    accent: str,
    type_scale: float,
    gap_scale: float,
    fit_scale: float = 1.0,
    fill: float = 1.0,
) -> str:
    """The :root custom properties. ``fit_scale`` (fit to one page, <= 1) multiplies the type
    and gap scales; ``--body-min`` then holds the body at 9pt however far the scale drops.
    ``fill`` (page balance, >= 1) widens spacing only (``--fill``, ``--fill-soft``, ``--lead``)."""
    tokens = accent_tokens(accent)
    fit = f"--fit-scale: {fit_scale:g}; --body-min: 9pt; " if fit_scale < 1 else ""
    fit += "".join(f"--{name}: {value:g}; " for name, value in balance_vars(fill).items())
    type_scale, gap_scale = round(type_scale * fit_scale, 4), round(gap_scale * fit_scale, 4)
    return (
        ":root { "
        f"{fit}"
        f"--font-body: {_stack(plan.body)}; --font-heading: {_stack(plan.heading)}; "
        f"--accent: {tokens['accent']}; --accent-tint: {tokens['accent_tint']}; "
        f"--on-accent: {tokens['on_accent']}; --type: {type_scale}; --gap: {gap_scale}; }}"
    )


def _drawable(ctx, value: str) -> str:
    """``value`` with the characters no bundled font can draw as spaces (never a fallback glyph)."""
    table = ctx.get("missing_table")
    return value.translate(table) if table else value


@pass_context
def _finalize(ctx, value):
    return _drawable(ctx, value) if type(value) is str else value


@pass_context
def _autolink(ctx, text: str) -> Markup:
    """Escaped text with every URL a real link (a link annotation in the PDF)."""
    text = _drawable(ctx, text)
    cursor, parts = 0, []
    for match in URL_RE.finditer(text):
        url = escape(match.group())
        parts.extend((escape(text[cursor : match.start()]), f'<a href="{url}">{url}</a>'))
        cursor = match.end()
    parts.append(escape(text[cursor:]))
    return Markup("".join(parts))  # noqa: S704 - every piece above is escaped


@functools.cache
def _environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        autoescape=True,
        undefined=StrictUndefined,
        finalize=_finalize,
        trim_blocks=False,
        keep_trailing_newline=True,
    )
    env.filters["autolink"] = _autolink
    env.filters["list_items"] = list_items
    env.filters["name_level_pairs"] = name_level_pairs
    return env


def _contact_items(model: CvRenderModel) -> list[dict[str, str | None]]:
    header = model.header
    items: list[dict[str, str | None]] = []
    if header.location:
        items.append({"text": header.location, "href": None})
    if header.email:
        items.append({"text": header.email, "href": f"mailto:{header.email}"})
    if header.phone:
        items.append({"text": header.phone, "href": None})
    for link in header.links:
        href = None
        if _HOSTLIKE_RE.fullmatch(link):
            href = link if link.lower().startswith(("http://", "https://")) else f"https://{link}"
        items.append({"text": link, "href": href})
    return items


GLOBAL_DEFAULT_ACCENT = "#111827"

# A custom section joins the sidebar only when it is a few plain lines (Languages,
# Interests); anything with entry headings or more text stays in the main column.
_SIDEBAR_CUSTOM_MAX_CHARS = 240
_LIST_SPLIT_RE = re.compile(r"\s*(?:[•·|;\n]|,(?![^()]*\)))\s*")
_PAIR_RE = re.compile(r"^(?P<name>[^()]+?)\s*\((?P<level>[^()]+)\)$")


def _in_sidebar(section, kinds: tuple[str, ...]) -> bool:
    if section.kind not in kinds:
        return False
    if section.kind != "custom":
        return True
    return all(entry.heading is None for entry in section.entries) and (
        sum(len(entry.paragraph or "") for entry in section.entries) <= _SIDEBAR_CUSTOM_MAX_CHARS
    )


def list_items(text: str) -> list[str]:
    """A list written as one line ("React • Vue, Go") as its items, in order."""
    return [item for item in _LIST_SPLIT_RE.split(text) if item.strip()]


def name_level_pairs(text: str) -> list[tuple[str, str | None]] | None:
    """ "English (fluent), Dutch (native)" as [(name, level), ...]; None unless every item has a level."""
    pairs = []
    for item in list_items(text):
        match = _PAIR_RE.match(item)
        if not match:
            return None
        pairs.append((match["name"], match["level"]))
    return pairs or None


def initials(name: str) -> str:
    """The monogram of a name: the first letters of its first and last words."""
    words = [word for word in re.split(r"[\s]+", name) if word[:1].isalpha()]
    if not words:
        return ""
    letters = words[0][0] + (words[-1][0] if len(words) > 1 else "")
    return letters.upper()


def render_cv_html(model: CvRenderModel, *, page_size: str = "a4") -> str:
    """One self-contained HTML document for the model, in its (mapped) template."""
    template_id = html_template_id(model.template_id)
    manifest = load_manifest(template_id)
    missing = set(model.unsupported_characters)
    tokens = model.tokens
    font_override = str(tokens.get("font_override") or "") or None
    plan = font_plan(template_id, font_override)
    accent = str(tokens.get("accent") or manifest.default_accent or GLOBAL_DEFAULT_ACCENT)
    # Sidebar templates print the main column first and the sidebar after it, so text
    # extraction reads header, main sections, then sidebar sections, each one whole.
    side = [s for s in model.sections if _in_sidebar(s, manifest.sidebar_kinds)]
    side_ids = {s.id for s in side}
    main = [s for s in model.sections if s.id not in side_ids]
    fill = int(tokens.get("fill_pct", 100)) / 100
    return (
        _environment()
        .get_template(f"{template_id}/template.html.j2")
        .render(
            title=model.document_name,
            header=model.header,
            contact_items=_contact_items(model),
            sections=model.sections,
            main_sections=main,
            side_sections=side,
            initials=initials(model.header.title),
            fontface=Markup(_font_face_css(template_id, font_override)),  # noqa: S704 - bundled files only
            root_vars=Markup(  # noqa: S704 - built from bundled fonts and a validated hex colour
                _root_vars(
                    plan,
                    accent,
                    int(tokens.get("type_scale_pct", 100)) / 100,
                    int(tokens.get("gap_scale_pct", 100)) / 100,
                    int(tokens.get("fit_scale_pct", 100)) / 100,
                    fill,
                )
            ),
            base_css=Markup(_base_css()),  # noqa: S704 - bundled file only
            css=Markup(_template_css(template_id)),  # noqa: S704 - bundled file only
            page_size=PAGE_SIZES[page_size],
            margin={
                "top": balanced_margin_mm(manifest.margin_top_mm, fill),
                "right": manifest.margin_right_mm,
                "bottom": balanced_margin_mm(manifest.margin_bottom_mm, fill),
                "left": manifest.margin_left_mm,
            },
            missing_table={ord(c): " " for c in missing},
        )
    )
