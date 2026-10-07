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
from app.services.cv_fonts import FONTS_DIR, needs_glyph

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


@functools.cache
def _covered_codepoints(template_id: str) -> frozenset[int]:
    """Codepoints every face of the template can draw (a missing one in any weight is a gap)."""
    import fitz

    covered: frozenset[int] | None = None
    for face in load_manifest(template_id).fonts:
        font = fitz.Font(fontfile=str(FONTS_DIR / face.file))
        points = frozenset(font.valid_codepoints())
        covered = points if covered is None else covered & points
    return covered or frozenset()


def missing_characters(template_id: str, text: str) -> list[str]:
    """Characters in ``text`` the template's bundled fonts cannot draw, once each."""
    covered = _covered_codepoints(template_id)
    return list(dict.fromkeys(c for c in text if needs_glyph(c) and ord(c) not in covered))


@functools.cache
def _font_face_css(template_id: str) -> str:
    rules = []
    for face in load_manifest(template_id).fonts:
        data = base64.b64encode((FONTS_DIR / face.file).read_bytes()).decode("ascii")
        rules.append(
            f'@font-face {{ font-family: "{face.family}"; font-weight: {face.weight}; '
            f"font-style: {face.style}; "
            f'src: url("data:font/ttf;base64,{data}") format("truetype"); }}'
        )
    return "\n".join(rules)


@functools.cache
def _template_css(template_id: str) -> str:
    return (TEMPLATES_DIR / template_id / "template.css").read_text("utf-8")


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


def render_cv_html(model: CvRenderModel, *, page_size: str = "a4") -> str:
    """One self-contained HTML document for the model, in its (mapped) template."""
    template_id = html_template_id(model.template_id)
    manifest = load_manifest(template_id)
    missing = set(model.unsupported_characters)
    tokens = model.tokens
    return (
        _environment()
        .get_template(f"{template_id}/template.html.j2")
        .render(
            title=model.document_name,
            header=model.header,
            contact_items=_contact_items(model),
            sections=model.sections,
            fontface=Markup(_font_face_css(template_id)),  # noqa: S704 - bundled files only
            css=Markup(_template_css(template_id)),  # noqa: S704 - bundled file only
            page_size=PAGE_SIZES[page_size],
            margin={
                "top": manifest.margin_top_mm,
                "right": manifest.margin_right_mm,
                "bottom": manifest.margin_bottom_mm,
                "left": manifest.margin_left_mm,
            },
            type_scale=int(tokens.get("type_scale_pct", 100)) / 100,
            gap_scale=int(tokens.get("gap_scale_pct", 100)) / 100,
            missing_table={ord(c): " " for c in missing},
        )
    )
