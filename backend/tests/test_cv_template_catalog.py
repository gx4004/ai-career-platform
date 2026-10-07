"""CV T2 (#461): the 16-id schema, the manifest-built catalog, legacy ids and the style migration."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import get_args

import fitz
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

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
    assert is_ats_safe("classic") and is_ats_safe("lagoon")  # lagoon prints as classic for now


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


def test_style_migration_rewrites_legacy_ids_and_reverses():
    module = _migration()
    engine = sa.create_engine("sqlite://")
    legacy = {"template_id": "modern-two-column", "font_id": "lato", "density": "compact"}
    rows = {
        "a": legacy,
        "b": {"template_id": "minimal-serif"},
        "c": {"template_id": "classic", "page_size": "letter", "fit_one_page": True, "font_id": None},
        "d": None,
        "e": {"template_id": "technical-portfolio", "ats_mode": True},
    }
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

    assert upgraded["a"] == {**legacy, "template_id": "lagoon"}
    assert upgraded["b"] == {"template_id": "executive"}
    assert upgraded["c"] == rows["c"] and upgraded["d"] is None
    assert upgraded["e"] == {"template_id": "slate", "ats_mode": True}
    assert downgraded["a"]["template_id"] == "modern-two-column"
    assert downgraded["c"] == {"template_id": "ats-essential"}
    assert downgraded["d"] is None
    # Every stored style the downgrade leaves still parses under the pre-catalog schema's keys.
    assert all(set(s) <= {"template_id", "font_id", "accent_color", "density", "ats_mode"}
               for s in downgraded.values() if s)
    for style in upgraded.values():
        if style:
            CvStyle(**style)
