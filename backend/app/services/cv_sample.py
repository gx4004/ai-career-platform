"""The built-in sample CV the template gallery draws every template with.

A full, one-page, English CV of a fictional person (every address is on example.com, the
phone number is in a range reserved for drama), so each template looks complete and the
gallery tiles compare like for like. The full sample runs a little over one page in every
template; ``trimmed_sample(n)`` drops the ``n`` least important lines (``TRIM_ORDER``), and the
gallery uses the smallest ``n`` that keeps the template on one page, so every tile is a full
page and never a cut-off one (tested in ``tests/test_cv_thumbnails.py``). Changing it changes every thumbnail: bump
``SAMPLE_VERSION`` so cached thumbnails are not served for the old content.

The shape is what ``build_render_model`` takes (``name``, ``header``, ``sections``).
"""

from __future__ import annotations

from types import SimpleNamespace

SAMPLE_VERSION = "1"


def _entry(entry_id: str, position: int, **fields) -> dict:
    base = {
        "id": entry_id,
        "evidence_item_id": None,
        "position": position,
        "body": fields.get("heading") or "-",
        "start_date": None,
        "end_date": None,
        "heading": None,
        "subheading": None,
        "location": None,
        "bullets": [],
    }
    base.update(fields)
    return base


def _section(section_id: str, kind: str, title: str, position: int, entries: list[dict]) -> dict:
    return {
        "id": section_id,
        "kind": kind,
        "title": title,
        "visible": True,
        "position": position,
        "entries": entries,
    }


def sample_cv() -> SimpleNamespace:
    """A fresh copy of the sample CV (callers may not share or mutate one)."""
    return SimpleNamespace(
        name="Sample CV",
        header={
            "name": "Elena Hart",
            "headline": "Senior Product Engineer",
            "email": "elena.hart@example.com",
            "phone": "+44 20 7946 0123",
            "location": "London, United Kingdom",
            "links": ["linkedin.com/in/elena-hart-example", "github.com/elena-hart-example"],
        },
        sections=[
            _section(
                "summary",
                "summary",
                "Summary",
                0,
                [
                    _entry(
                        "summary-1",
                        0,
                        body=(
                            "Product engineer with eight years of experience building web and mobile products "
                            "for fintech and retail. I turn vague problems into shipped features, measure what "
                            "changed and keep the codebase calm for the next person. Happiest in small teams "
                            "that talk to their customers every week and ship in small, reversible steps."
                        ),
                    )
                ],
            ),
            _section(
                "experience",
                "experience",
                "Experience",
                1,
                [
                    _entry(
                        "role-1",
                        0,
                        heading="Senior Product Engineer",
                        subheading="Northwind Bank",
                        location="London",
                        start_date="Jan 2022",
                        end_date="Present",
                        bullets=[
                            "Led a team of five rebuilding the mobile onboarding flow; completion rose from 61% to 78% in two quarters.",
                            "Cut the median response time of the accounts API from 420 ms to 140 ms by reworking caching and queries.",
                            "Introduced feature flags and staged rollouts, which ended weekend release freezes for the whole department.",
                            "Mentored three engineers to promotion and ran the frontend guild of 30 people across four product teams.",
                        ],
                    ),
                    _entry(
                        "role-2",
                        1,
                        heading="Product Engineer",
                        subheading="Fernhill Retail",
                        location="Manchester",
                        start_date="Mar 2019",
                        end_date="Dec 2021",
                        bullets=[
                            "Built the click-and-collect checkout used by 2.4M customers a year, from first sketch to national launch.",
                            "Moved the storefront to server rendering, lifting mobile conversion by 9% and halving time to first paint.",
                            "Paired with designers on an accessible design system of 45 components, now used by every web team.",
                            "Ran the move from a monolith to three services without a single minute of planned downtime.",
                        ],
                    ),
                    _entry(
                        "role-3",
                        2,
                        heading="Software Developer",
                        subheading="Brightline Studio",
                        location="Leeds",
                        start_date="Sep 2016",
                        end_date="Feb 2019",
                        bullets=[
                            "Delivered 14 client web apps in React and Node.js, most of them within a six-week delivery cycle.",
                            "Set up automated testing and continuous integration, cutting bugs reported after launch by half.",
                            "Wrote the onboarding guide for new developers and ran a monthly lunch-and-learn on accessibility.",
                            "Rebuilt the studio website as a static site, bringing its Lighthouse performance score from 54 to 98.",
                        ],
                    ),
                ],
            ),
            _section(
                "projects",
                "projects",
                "Projects",
                2,
                [
                    _entry(
                        "project-1",
                        0,
                        heading="Ledgerline (open source)",
                        bullets=[
                            "A small budgeting app in TypeScript and SQLite with 1,200 GitHub stars."
                        ],
                    ),
                    _entry(
                        "project-2",
                        1,
                        heading="Accessible Forms Kit",
                        bullets=["Form components that pass WCAG 2.2 AA, used by two charities."],
                    ),
                ],
            ),
            _section(
                "education",
                "education",
                "Education",
                3,
                [
                    _entry(
                        "education-1",
                        0,
                        heading="BSc Computer Science",
                        subheading="University of Leeds",
                        start_date="2013",
                        end_date="2016",
                        bullets=["First-class honours"],
                    ),
                ],
            ),
            _section(
                "certifications",
                "certifications",
                "Certifications",
                4,
                [
                    _entry("certification-1", 0, body="AWS Certified Developer, Associate (2023)"),
                    _entry("certification-2", 1, body="Certified Scrum Product Owner (2021)"),
                ],
            ),
            _section(
                "skills",
                "skills",
                "Skills",
                5,
                [
                    _entry(
                        "skills-1",
                        0,
                        body=(
                            "TypeScript • React • React Native • Next.js • Node.js • GraphQL • PostgreSQL • "
                            "AWS • Docker • Terraform • Playwright • Jest • Accessibility • Figma • "
                            "Product discovery • Mentoring"
                        ),
                    )
                ],
            ),
            _section(
                "languages",
                "custom",
                "Languages",
                6,
                [
                    _entry(
                        "languages-1",
                        0,
                        body="English (native), Spanish (fluent), French (conversational)",
                    )
                ],
            ),
        ],
    )


# What goes first when the sample has to shrink to one page: (section id, entry id, bullet index),
# a bullet index of None drops the whole entry. Fourth bullets, project lines, third bullets, then
# whole small entries; never the header, the summary, a role, skills or languages.
TRIM_ORDER: tuple[tuple[str, str, int | None], ...] = (
    ("experience", "role-3", 3),
    ("experience", "role-2", 3),
    ("experience", "role-1", 3),
    ("projects", "project-2", 0),
    ("projects", "project-1", 0),
    ("education", "education-1", 0),
    ("experience", "role-3", 2),
    ("experience", "role-2", 2),
    ("certifications", "certification-2", None),
    ("experience", "role-1", 2),
    ("projects", "project-2", None),
    ("experience", "role-3", 1),
    ("experience", "role-2", 1),
    ("projects", "project-1", None),
    ("experience", "role-1", 1),
)


def trimmed_sample(drop: int) -> SimpleNamespace:
    """The sample without the first ``drop`` items of ``TRIM_ORDER``."""
    cv = sample_cv()
    removals = TRIM_ORDER[: max(0, min(drop, len(TRIM_ORDER)))]
    # Remove later bullet indexes first so earlier ones keep their positions.
    for section_id, entry_id, bullet in sorted(
        removals, key=lambda r: -1 if r[2] is None else -r[2] - 2
    ):
        section = next(s for s in cv.sections if s["id"] == section_id)
        if bullet is None:
            section["entries"] = [e for e in section["entries"] if e["id"] != entry_id]
        else:
            entry = next((e for e in section["entries"] if e["id"] == entry_id), None)
            if entry is not None and bullet < len(entry["bullets"]):
                entry["bullets"].pop(bullet)
    return cv
