"""CV fixtures for the render tests (spec section 5): short, long, accented, Cyrillic, long name.

Each builder returns what ``build_render_model`` takes: an object with ``name``,
``header`` and ``sections`` (the same shape the router passes when it exports).
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


def maya() -> SimpleNamespace:
    """Short: one page. Mirrors the reference data of the recreations."""
    return SimpleNamespace(
        name="Maya CV",
        header={
            "name": "Maya Lindqvist",
            "headline": "Product-minded Frontend Engineer",
            "email": "maya.lindqvist@example.com",
            "phone": "+31 6 1234 5678",
            "location": "Amsterdam, Netherlands",
            "links": ["linkedin.com/in/maya-lindqvist-example", "github.com/maya-lindqvist-example"],
        },
        sections=[
            section("s", "summary", "Summary", 0, [entry("s1", 0, body=(
                "Frontend engineer with five years of experience building fast, accessible web "
                "apps in React and TypeScript. Comfortable owning features end to end, from "
                "design review to production metrics. Looking for a senior role on a product "
                "team that ships weekly."))]),
            section("x", "experience", "Experience", 1, [
                entry("x1", 0, heading="Frontend Engineer", subheading="Tulip Pay",
                      location="Amsterdam", start_date="Mar 2022", end_date="Present", bullets=[
                    "Rebuilt the merchant dashboard in React 18 and TypeScript, cutting page load time from 4.1s to 1.6s.",
                    "Led the move to a shared component library used by 4 product teams (38 components, full test coverage).",
                    "Raised the checkout flow to WCAG 2.1 AA; support tickets about the form dropped by 27%.",
                    "Mentored two junior engineers through their first year; both now own features independently."]),
                entry("x2", 1, heading="Junior Frontend Developer", subheading="Northwind Travel",
                      location="Rotterdam", start_date="Aug 2019", end_date="Feb 2022", bullets=[
                    "Built the booking search UI with Vue 2 and later migrated it to React, serving 1.2M monthly visitors.",
                    "Added end-to-end tests with Cypress, lowering production regressions from about 6 to 1 per quarter.",
                    "Worked with designers on a new mobile layout that lifted mobile conversion by 11%."]),
            ]),
            section("p", "projects", "Projects", 2, [
                entry("p1", 0, heading="Budget Buddy (open source)", bullets=[
                    "A small personal-finance app in Next.js and Supabase; 400 GitHub stars and 30 contributors."])]),
            section("ed", "education", "Education", 3, [
                entry("e1", 0, heading="BSc Information Science", subheading="University of Amsterdam",
                      start_date="2015", end_date="2019", bullets=["Thesis on accessible data visualisation"])]),
            section("sk", "skills", "Skills", 4, [entry("k1", 0, body=(
                "TypeScript • JavaScript • React • Next.js • Vue • HTML • CSS • "
                "Tailwind • Jest • Playwright • Cypress • Node.js • REST • GraphQL • "
                "Figma • Git • CI/CD"))]),
            section("l", "custom", "Languages", 5, [
                entry("l1", 0, body="English (fluent), Dutch (fluent), Swedish (native)")]),
        ],
    )


def _job(i: int, position: int, role: str, org: str, place: str, start: str, end: str, count: int) -> dict:
    bullets = [
        f"Delivered outcome {n} for {org}: cut cycle time by {10 + n}% across the platform, "
        "coordinating with product, design and support, and documenting the decisions made."
        for n in range(1, count + 1)
    ]
    return entry(f"job{i}", position, heading=role, subheading=org, location=place,
                 start_date=start, end_date=end, bullets=bullets)


def long_cv() -> SimpleNamespace:
    """Long: three jobs, projects and more; runs to two pages (spec section 5.1)."""
    cv = maya()
    cv.name = "Long CV"
    cv.sections[1] = section("x", "experience", "Experience", 1, [
        _job(1, 0, "Staff Engineer", "Tulip Pay", "Amsterdam", "Mar 2022", "Present", 8),
        _job(2, 1, "Senior Engineer", "Northwind Travel", "Rotterdam", "Aug 2019", "Feb 2022", 8),
        _job(3, 2, "Engineer", "Harbour Systems", "Utrecht", "Jan 2016", "Jul 2019", 8),
    ])
    cv.sections[2] = section("p", "projects", "Projects", 2, [
        entry(f"p{i}", i, heading=f"Open source project {i}", bullets=[
            f"A library for accessible data tables, used by {i * 40} teams; maintained for {i} years. https://example.com/p{i}"])
        for i in range(1, 4)
    ])
    return cv


def accented() -> SimpleNamespace:
    cv = maya()
    cv.header = {**cv.header, "name": "Zoë Åström-Nuñez", "location": "São Paulo, Brasil",
                 "headline": "Développeuse front-end — Łódź & Kraków"}
    cv.sections[0]["entries"][0]["body"] = (
        "Ingénieure logicielle spécialisée en accessibilité, écrite à Gdańsk "
        "(ąćęłńóśźż), avec une expérience de Niš à İstanbul.")
    return cv


def cyrillic() -> SimpleNamespace:
    cv = maya()
    cv.header = {**cv.header, "name": "Анастасия Ковальчук-Фёдорова",
                 "headline": "Старший фронтенд-разработчик",
                 "location": "Київ, Україна"}
    cv.sections[0]["title"] = "О себе"
    cv.sections[0]["entries"][0]["body"] = (
        "Фронтенд-инженер с пятилетним опытом "
        "разработки быстрых и доступных веб-приложений на React и TypeScript.")
    cv.sections[1]["title"] = "Опыт"
    cv.sections[1]["entries"][0].update(
        heading="Фронтенд-инженер", subheading="Tulip Pay", location="Амстердам",
        start_date="мар 2022", end_date="наст. время",
        bullets=["Переписала панель продавца на React 18 и TypeScript, сократив загрузку с 4,1 до 1,6 с.",
                 "Ввела общую библиотеку компонентов для 4 команд (38 компонентов)."])
    cv.sections[3]["entries"][0].update(
        heading="Бакалавр информатики",
        subheading="Київський національний університет імені Тараса Шевченка")
    cv.sections[1]["entries"] = cv.sections[1]["entries"][:1]
    return cv


def long_name() -> SimpleNamespace:
    cv = maya()
    cv.header = {
        **cv.header,
        "name": "Maria Alexandra Konstantinopoulou-Papadimitriou van der Westhuizen",
        "headline": "Senior Principal Product Engineering Manager for Platform Reliability and Developer Experience",
        "links": [
            "linkedin.com/in/maria-alexandra-konstantinopoulou-papadimitriou",
            "github.com/maria-alexandra-konstantinopoulou-papadimitriou",
            "https://www.example-portfolio-with-a-very-long-domain-name.co.uk/work",
        ],
    }
    return cv


ALL = {"maya": maya, "long": long_cv, "accented": accented, "cyrillic": cyrillic, "long_name": long_name}


# -- edge cases (the Classic perfection pass, #464) ------------------------------------------

LONG_ROLE = "Senior Staff Software Engineer, Payment Platform Reliability"  # 60 characters


def no_summary() -> SimpleNamespace:
    """Maya without the summary section: the header runs straight into Experience."""
    cv = maya()
    cv.name = "No summary CV"
    cv.sections = [s for s in cv.sections if s["kind"] != "summary"]
    return cv


def name_only() -> SimpleNamespace:
    """Only a name: no headline, contact or sections."""
    return SimpleNamespace(name="Name only CV", header={"name": "Maya Lindqvist"}, sections=[])


def edge_entries() -> SimpleNamespace:
    """Entries missing dates or location, one with twelve bullets, a 60-character role."""
    cv = maya()
    cv.name = "Edge entries CV"
    jobs = cv.sections[1]["entries"]
    jobs[0].update(heading=LONG_ROLE, subheading="Tulip Pay Financial Services International B.V.",
                   location="Amsterdam, North Holland, Netherlands")
    jobs[1].update(location=None)
    jobs.append(entry("x3", 2, heading="Freelance Web Developer", subheading="Self-employed",
                      location="Remote", bullets=[
        f"Shipped project {n}: a small marketing site with accessible forms and a CMS the client edits alone."
        for n in range(1, 13)]))
    cv.sections[2]["entries"][0].update(location="Remote")
    cv.sections[3]["entries"][0].update(start_date=None, end_date=None)
    return cv


EDGE = {"no_summary": no_summary, "name_only": name_only, "edge_entries": edge_entries}


# -- short CVs (adaptive page balance) ---------------------------------------------------------


def junior() -> SimpleNamespace:
    """A first-job CV: one role with one bullet, a degree and a skills line (a third of a page)."""
    return SimpleNamespace(
        name="Junior CV",
        header={
            "name": "Sam Taylor",
            "headline": "Junior Data Analyst",
            "email": "sam.taylor@example.com",
            "phone": "+44 20 7946 0456",
            "location": "Bristol",
            "links": [],
        },
        sections=[
            section("s", "summary", "Summary", 0, [entry("s1", 0, body=(
                "Analyst with one year of experience turning messy spreadsheets into clear weekly reports."))]),
            section("x", "experience", "Experience", 1, [
                entry("x1", 0, heading="Data Analyst", subheading="Harbour Logistics", location="Bristol",
                      start_date="2025", end_date="Present", bullets=[
                    "Built a weekly delivery report in SQL and Power BI used by 12 depot managers."])]),
            section("ed", "education", "Education", 2, [
                entry("e1", 0, heading="BSc Mathematics", subheading="University of Bristol",
                      start_date="2021", end_date="2024")]),
            section("sk", "skills", "Skills", 3, [entry("k1", 0, body="SQL • Python • Excel • Power BI")]),
        ],
    )


def graduate() -> SimpleNamespace:
    """About half a page: two short roles, a project, a degree, skills and languages."""
    cv = junior()
    cv.name = "Graduate CV"
    cv.header = {**cv.header, "links": ["linkedin.com/in/sam-taylor-example"]}
    cv.sections[1]["entries"].append(
        entry("x2", 1, heading="Analytics Intern", subheading="Severn Water", location="Bristol",
              start_date="Jun 2024", end_date="Sep 2024", bullets=[
            "Cleaned five years of meter readings and flagged 340 faulty sensors for replacement.",
            "Wrote a Python script that cut the monthly leak report from two days to an hour."]))
    cv.sections[1]["entries"][0]["bullets"].append(
        "Automated the stock reconciliation, saving the finance team about six hours a week.")
    cv.sections.insert(2, section("p", "projects", "Projects", 2, [
        entry("p1", 0, heading="Bus punctuality dashboard", bullets=[
            "A public Streamlit dashboard of Bristol bus delays built from open data."])]))
    cv.sections.append(section("l", "custom", "Languages", 5, [
        entry("l1", 0, body="English (native), Spanish (conversational)")]))
    return cv


SHORT = {"junior": junior, "graduate": graduate, "name_only": name_only, "no_summary": no_summary, "maya": maya}
