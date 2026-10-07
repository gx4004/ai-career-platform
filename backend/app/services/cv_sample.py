"""The built-in sample CV: shown in the template gallery while a CV has no entries yet.

The shape is what ``build_render_model`` takes (``name``, ``header``, ``sections``). The
render tests use the same content as their short fixture (``tests/cv_fixtures.maya``).
The person is fictional and every address is on example.com.
"""

from __future__ import annotations

from types import SimpleNamespace


def entry(entry_id: str, position: int, **fields) -> dict:
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


def section(section_id: str, kind: str, title: str, position: int, entries: list[dict]) -> dict:
    return {
        "id": section_id,
        "kind": kind,
        "title": title,
        "visible": True,
        "position": position,
        "entries": entries,
    }


def sample_cv() -> SimpleNamespace:
    """Short: one page. Mirrors the reference data of the recreations."""
    return SimpleNamespace(
        name="Maya CV",
        header={
            "name": "Maya Lindqvist",
            "headline": "Product-minded Frontend Engineer",
            "email": "maya.lindqvist@example.com",
            "phone": "+31 6 1234 5678",
            "location": "Amsterdam, Netherlands",
            "links": [
                "linkedin.com/in/maya-lindqvist-example",
                "github.com/maya-lindqvist-example",
            ],
        },
        sections=[
            section(
                "s",
                "summary",
                "Summary",
                0,
                [
                    entry(
                        "s1",
                        0,
                        body=(
                            "Frontend engineer with five years of experience building fast, accessible web "
                            "apps in React and TypeScript. Comfortable owning features end to end, from "
                            "design review to production metrics. Looking for a senior role on a product "
                            "team that ships weekly."
                        ),
                    )
                ],
            ),
            section(
                "x",
                "experience",
                "Experience",
                1,
                [
                    entry(
                        "x1",
                        0,
                        heading="Frontend Engineer",
                        subheading="Tulip Pay",
                        location="Amsterdam",
                        start_date="Mar 2022",
                        end_date="Present",
                        bullets=[
                            "Rebuilt the merchant dashboard in React 18 and TypeScript, cutting page load time from 4.1s to 1.6s.",
                            "Led the move to a shared component library used by 4 product teams (38 components, full test coverage).",
                            "Raised the checkout flow to WCAG 2.1 AA; support tickets about the form dropped by 27%.",
                            "Mentored two junior engineers through their first year; both now own features independently.",
                        ],
                    ),
                    entry(
                        "x2",
                        1,
                        heading="Junior Frontend Developer",
                        subheading="Northwind Travel",
                        location="Rotterdam",
                        start_date="Aug 2019",
                        end_date="Feb 2022",
                        bullets=[
                            "Built the booking search UI with Vue 2 and later migrated it to React, serving 1.2M monthly visitors.",
                            "Added end-to-end tests with Cypress, lowering production regressions from about 6 to 1 per quarter.",
                            "Worked with designers on a new mobile layout that lifted mobile conversion by 11%.",
                        ],
                    ),
                ],
            ),
            section(
                "p",
                "projects",
                "Projects",
                2,
                [
                    entry(
                        "p1",
                        0,
                        heading="Budget Buddy (open source)",
                        bullets=[
                            "A small personal-finance app in Next.js and Supabase; 400 GitHub stars and 30 contributors."
                        ],
                    )
                ],
            ),
            section(
                "ed",
                "education",
                "Education",
                3,
                [
                    entry(
                        "e1",
                        0,
                        heading="BSc Information Science",
                        subheading="University of Amsterdam",
                        start_date="2015",
                        end_date="2019",
                        bullets=["Thesis on accessible data visualisation"],
                    )
                ],
            ),
            section(
                "sk",
                "skills",
                "Skills",
                4,
                [
                    entry(
                        "k1",
                        0,
                        body=(
                            "TypeScript • JavaScript • React • Next.js • Vue • HTML • CSS • "
                            "Tailwind • Jest • Playwright • Cypress • Node.js • REST • GraphQL • "
                            "Figma • Git • CI/CD"
                        ),
                    )
                ],
            ),
            section(
                "l",
                "custom",
                "Languages",
                5,
                [entry("l1", 0, body="English (fluent), Dutch (fluent), Swedish (native)")],
            ),
        ],
    )
