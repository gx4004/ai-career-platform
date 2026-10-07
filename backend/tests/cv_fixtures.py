"""CV fixtures for the render tests (spec section 5): short, long, accented, Cyrillic, long name.

Each builder returns what ``build_render_model`` takes: an object with ``name``,
``header`` and ``sections`` (the same shape the router passes when it exports).
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services.cv_sample import entry, sample_cv, section  # noqa: F401 - re-exported


def maya() -> SimpleNamespace:
    """Short: one page. The built-in sample CV (``app/services/cv_sample.py``)."""
    return sample_cv()


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
