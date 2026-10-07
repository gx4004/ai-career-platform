"""CV T2 (#461): the 16-id schema, the manifest-built catalog, legacy ids and the style migration."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Literal, get_args

import fitz
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.cv_documents import LEGACY_CV_TEMPLATE_IDS, CvStyle, CvTemplateId
from app.services.cv_html import TEMPLATES_DIR, available_template_ids, load_manifest
from app.services.cv_rendering import TEMPLATES, is_ats_safe, style_catalog
from tests import cv_fixtures

PREFIX = "/api/v1/cv-documents"
SPEC_IDS = (
    "classic scholar academic manuscript executive frame lagoon lilac meadow rail almanac "
    "slate violet grotesk panel ledger"
).split()


def test_schema_holds_the_sixteen_spec_ids():
    assert list(get_args(CvTemplateId)) == SPEC_IDS


def test_every_template_directory_has_a_manifest_the_schema_accepts():
    on_disk = {p.name for p in TEMPLATES_DIR.iterdir() if p.is_dir() and not p.name.startswith("_")}
    assert on_disk <= set(get_args(CvTemplateId)), "a template directory has no id in CvTemplateId"
    for template_id in on_disk:
        manifest = load_manifest(template_id)
        assert manifest.id == template_id
        assert (TEMPLATES_DIR / template_id / "template.html.j2").is_file()
    # The catalog is exactly the available (on-disk) templates, nothing hardcoded.
    assert set(available_template_ids()) == on_disk == set(TEMPLATES)
    assert [t.id for t in style_catalog().templates] == list(available_template_ids())


def test_manifest_group_follows_ats_safety():
    for template in style_catalog().templates:
        assert template.group == ("ats-safe" if template.ats_safe else "more")
        assert template.columns == (1 if template.ats_safe else template.columns)


@pytest.mark.parametrize("legacy,expected", sorted(LEGACY_CV_TEMPLATE_IDS.items()))
def test_legacy_template_ids_still_parse_and_map(legacy, expected):
    assert CvStyle(template_id=legacy).template_id == expected
    assert CvStyle.model_validate({"template_id": legacy, "font_id": "lato"}).template_id == expected


def test_legacy_map_matches_the_spec():
    assert LEGACY_CV_TEMPLATE_IDS == {
        "ats-essential": "classic",
        "professional-editorial": "executive",
        "minimal-serif": "executive",
        "technical-portfolio": "slate",
        "modern-two-column": "lagoon",
    }


def test_new_style_defaults_and_unknown_ids():
    style = CvStyle()
    assert (style.template_id, style.font_id, style.page_size, style.fit_one_page) == (
        "classic", None, "a4", False,
    )
    with pytest.raises(ValueError):
        CvStyle(template_id="not-a-template")
    with pytest.raises(ValueError):
        CvStyle(page_size="legal")


def test_a_stored_legacy_style_opens_and_exports(client, auth_headers, db, test_user):
    from app.models.cv_document import CvDocument

    created = client.post(PREFIX, json={"name": "Old"}, headers=auth_headers).json()
    row = db.get(CvDocument, created["id"])
    row.style = {"template_id": "modern-two-column", "font_id": "pt-serif", "accent_color": "#111827",
                 "density": "normal", "ats_mode": False}
    db.commit()
    fetched = client.get(f"{PREFIX}/{created['id']}", headers=auth_headers).json()["style"]
    assert fetched["template_id"] == "lagoon" and fetched["font_id"] == "source-serif-4"
    assert client.get(f"{PREFIX}/{created['id']}/artifacts/pdf", headers=auth_headers).status_code == 200


def test_ats_mode_catalog_offers_only_ats_safe_templates_and_forces_classic():
    catalog = style_catalog()
    safe = [t.id for t in catalog.templates if t.ats_safe]
    assert catalog.ats_mode.template_id == "classic"
    assert catalog.ats_mode.offered_template_ids == safe
    assert "classic" in safe


def test_is_ats_safe_resolves_unavailable_ids_to_the_default():
    assert is_ats_safe("classic") and is_ats_safe("ledger")  # ledger is not built; it prints as classic


@pytest.mark.parametrize("size,expected", [("a4", (595, 842)), ("letter", (612, 792))])
def test_page_size_reaches_the_pdf(size, expected):
    from app.services.cv_rendering import build_render_model, render_pdf

    model = build_render_model(cv_fixtures.maya(), "classic", CvStyle(page_size=size))
    with fitz.open(stream=render_pdf(model), filetype="pdf") as pdf:
        assert (round(pdf[0].rect.width), round(pdf[0].rect.height)) == expected


# --- migration ---------------------------------------------------------------


def _migration():
    path = next((Path(__file__).parent.parent / "alembic" / "versions").glob("*cv_style_template_catalog.py"))
    spec = importlib.util.spec_from_file_location("cv_style_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# The pre-catalog CvStyle, frozen as it was before a8d4f1c7e3b9: a downgraded row must parse here.
_LEGACY_PALETTE = {"#111827", "#7C2D12", "#075985", "#166534", "#6D28D9", "#B91C1C", "#0F766E"}


class _LegacyCvStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: Literal[
        "ats-essential", "professional-editorial", "technical-portfolio", "modern-two-column",
        "minimal-serif",
    ] = "ats-essential"
    font_id: Literal["lato", "pt-sans", "pt-serif", "crimson-text", "ibm-plex-mono"] = "lato"
    accent_color: str = Field(default="#111827", pattern=r"^#[0-9a-fA-F]{6}$")
    density: Literal["compact", "normal", "spacious"] = "normal"
    ats_mode: bool = False

    @field_validator("accent_color")
    @classmethod
    def _accent_in_palette(cls, value: str) -> str:
        if value.upper() not in _LEGACY_PALETTE:
            raise ValueError("accent_color must be one of the curated palette colors")
        return value


def _run_migration(rows: dict) -> tuple[dict, dict]:
    module = _migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE cv_documents (id TEXT PRIMARY KEY, style JSON)"))
        for row_id, style in rows.items():
            conn.execute(
                sa.text("INSERT INTO cv_documents VALUES (:i, :s)"),
                {"i": row_id, "s": None if style is None else json.dumps(style)},
            )

        def read():
            out = {}
            for row_id, style in conn.execute(sa.text("SELECT id, style FROM cv_documents")).all():
                out[row_id] = None if style is None else json.loads(style)
            return out

        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()
            upgraded = read()
            module.downgrade()
            downgraded = read()
    return upgraded, downgraded


def test_style_migration_rewrites_legacy_ids_and_reverses():
    legacy = {"template_id": "modern-two-column", "font_id": "lato", "density": "compact"}
    rows = {
        "a": legacy,
        "b": {"template_id": "minimal-serif"},
        "c": {"template_id": "classic", "page_size": "letter", "fit_one_page": True, "font_id": None},
        "d": None,
        "e": {"template_id": "technical-portfolio", "ats_mode": True},
        "f": {"template_id": "ats-essential", "font_id": "pt-serif", "accent_color": "#075985"},
    }
    upgraded, downgraded = _run_migration(rows)

    # Upgrade: catalog ids, and the old always-persisted default typeface becomes "the template's own".
    assert upgraded["a"] == {"template_id": "lagoon", "font_id": None, "density": "compact"}
    assert upgraded["b"] == {"template_id": "executive"}
    assert upgraded["c"] == rows["c"] and upgraded["d"] is None
    assert upgraded["e"] == {"template_id": "slate", "ats_mode": True}
    assert upgraded["f"] == {"template_id": "classic", "font_id": "pt-serif", "accent_color": "#075985"}
    for style in upgraded.values():
        if style:
            CvStyle(**style)
    assert CvStyle(**upgraded["a"]).font_id is None

    # Downgrade: values, not just keys, are ones the old schema accepts.
    assert downgraded["a"] == {"template_id": "modern-two-column", "font_id": "lato", "density": "compact"}
    assert downgraded["b"] == {"template_id": "professional-editorial"}
    assert downgraded["c"] == {"template_id": "ats-essential", "font_id": "lato"}
    assert downgraded["d"] is None
    assert downgraded["f"] == {"template_id": "ats-essential", "font_id": "pt-serif", "accent_color": "#075985"}
    for style in downgraded.values():
        if style:
            _LegacyCvStyle.model_validate(style)


def test_style_migration_downgrade_only_writes_values_the_old_schema_accepts():
    """Rows written by the new code (null accent, new typefaces, new colours, new templates)."""
    fonts = ["inter", "lora", "eb-garamond", "source-sans-3", "ibm-plex-sans", "source-serif-4", None] * 3
    accents = [None, "#9D174D", "#334155", "#B45309", "#0f766e", "#111827", "#7C2D12"] * 3
    rows = {
        f"t-{template}": {"template_id": template, "font_id": font, "accent_color": accent,
                          "density": "spacious", "ats_mode": False, "page_size": "letter",
                          "fit_one_page": True}
        for template, font, accent in zip(SPEC_IDS, fonts, accents, strict=False)
    }
    rows["empty"] = {}
    _, downgraded = _run_migration(rows)
    for row_id, style in downgraded.items():
        parsed = _LegacyCvStyle.model_validate(style)
        assert "page_size" not in style and "fit_one_page" not in style, row_id
        if row_id != "empty":
            assert parsed.density == "spacious"
    assert downgraded["empty"] == {}
    t = {template: downgraded[f"t-{template}"] for template in SPEC_IDS}
    # Null accent and the new palette colours fall back to Ink; old colours stay.
    assert t["classic"]["accent_color"] == "#111827"
    assert t["scholar"]["accent_color"] == "#111827"  # Plum
    assert t["academic"]["accent_color"] == "#111827"  # Slate
    assert t["manuscript"]["accent_color"] == "#111827"  # Amber
    assert t["executive"]["accent_color"] == "#0f766e"
    assert t["lagoon"]["accent_color"] == "#7C2D12"
    # Every new typeface and the null override fall back to the old default.
    assert {style["font_id"] for style in t.values()} == {"lato"}
    # Templates go back to the nearest of the five legacy ids.
    assert {k: v["template_id"] for k, v in t.items()} == {
        "classic": "ats-essential", "scholar": "minimal-serif", "academic": "minimal-serif",
        "manuscript": "minimal-serif", "executive": "professional-editorial",
        "frame": "professional-editorial", "lagoon": "modern-two-column",
        "lilac": "modern-two-column", "meadow": "modern-two-column", "rail": "modern-two-column",
        "almanac": "modern-two-column", "slate": "technical-portfolio",
        "violet": "professional-editorial", "grotesk": "technical-portfolio",
        "panel": "modern-two-column", "ledger": "modern-two-column",
    }
