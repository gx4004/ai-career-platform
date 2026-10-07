"""A corpus of realistic CVs for the importer (#470): DOCX in several layouts, PDF printed by
our classic template and PDF converted from DOCX by LibreOffice.

Every CV is a spec (header, sections, entries with the fields the importer must read back);
``docx_bytes`` writes it the way a person lays out a Word CV, ``pdf_bytes`` prints it through
the classic template. ``expected`` is what the importer has to return. The files under
``tests/fixtures/cv_import/`` are produced by ``python -m tests.cv_import_corpus``.
"""

from __future__ import annotations

import io
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

from docx import Document
from docx.shared import Pt

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "cv_import"
SOFFICE = shutil.which("soffice") or "/opt/homebrew/bin/soffice"


def job(heading, subheading, location, start, end, bullets=(), sep=" – "):
    return {"heading": heading, "subheading": subheading, "location": location,
            "start_date": start, "end_date": end, "bullets": list(bullets), "sep": sep}


def plain(body):
    return {"body": body}


EN_BULLETS = [
    "Rebuilt the checkout flow in React and TypeScript, cutting load time from 4.1s to 1.6s.",
    "Led a migration of 38 components to a shared library used by four product teams.",
]
RU_BULLETS = [
    "Переписал панель продавца на React и TypeScript, ускорив загрузку с 4,1 до 1,6 секунды.",
    "Вёл переход на общую библиотеку компонентов для четырёх продуктовых команд.",
]

MAYA_HEADER = {
    "name": "Maya Lindqvist", "headline": "Product-minded Frontend Engineer",
    "email": "maya.lindqvist@example.com", "phone": "+31 6 1234 5678",
    "location": "Amsterdam, Netherlands",
    "links": ["linkedin.com/in/maya-lindqvist-example", "github.com/maya-lindqvist-example"],
}


def _sections(experience, *, education=None, summary="Frontend engineer with five years of experience.",
              skills="TypeScript, React, Node.js, GraphQL", titles=None, extra=()):
    titles = titles or {}
    out = []
    if summary:
        out.append({"kind": "summary", "title": titles.get("summary", "Summary"), "entries": [plain(summary)]})
    out.append({"kind": "experience", "title": titles.get("experience", "Experience"), "entries": experience})
    if education:
        out.append({"kind": "education", "title": titles.get("education", "Education"), "entries": education})
    if skills:
        out.append({"kind": "skills", "title": titles.get("skills", "Skills"), "entries": [plain(skills)]})
    out.extend(extra)
    return out


SPECS: dict[str, dict] = {
    "date_formats": {
        "layout": "tab", "section_style": "heading", "bullets": "list",
        "header": MAYA_HEADER,
        "sections": _sections([
            job("Frontend Engineer", "Tulip Pay", "Amsterdam", "Mar 2022", "Present", EN_BULLETS),
            job("Web Developer", "Northwind Travel", "Amsterdam, NL", "03/2019", "now", EN_BULLETS[:1], sep=" - "),
            job("Junior Developer", "Harbour Systems", "Remote", "2016", "2019", EN_BULLETS[:1], sep="–"),
            job("Intern", "Bright Labs", "Utrecht", "Jan 2015", "Dec 2015", [], sep=" to "),
        ], education=[job("BSc Information Science", "University of Amsterdam", None, "2012", "2016", [])]),
    },
    "company_first": {
        "layout": "company_first", "section_style": "bold", "bullets": "•",
        "header": {**MAYA_HEADER, "name": "Daniel Okafor", "headline": "Backend Engineer", "email": "daniel.okafor@example.com"},
        "sections": _sections([
            job("Senior Backend Engineer", "Stripe Payments Europe", "Dublin, Ireland", "Feb 2021", "Present", EN_BULLETS),
            job("Software Engineer", "Acme Corp", "Remote", "Jun 2017", "Jan 2021", EN_BULLETS[:1]),
        ], education=[job("MSc Computer Science", "Trinity College Dublin", "Dublin", "2015", "2017", [])],
            titles={"experience": "Work History"}),
    },
    "stacked": {
        "layout": "stacked", "section_style": "heading", "bullets": "-",
        "header": {**MAYA_HEADER, "name": "Priya Raman", "headline": "Data Analyst", "email": "priya.raman@example.com"},
        "sections": _sections([
            job("Data Analyst", "Globex Analytics", "Amsterdam", "Sep 2020", "Present", EN_BULLETS),
            job("Research Assistant", "Delft University of Technology", "Delft", "Sep 2018", "Aug 2020", EN_BULLETS[:1]),
        ], titles={"experience": "Professional Experience"}),
    },
    "comma_paren": {
        "layout": "comma_paren", "section_style": "bold", "bullets": "–",
        "header": {**MAYA_HEADER, "name": "Tom Becker", "headline": None, "email": "tom.becker@example.com"},
        "sections": _sections([
            job("Product Designer", "Pixel Forge", "Berlin", "Mar 2022", "Present", EN_BULLETS),
            job("UX Designer", "Studio Nord", "Hamburg, DE", "Apr 2018", "Feb 2022", EN_BULLETS[:1]),
        ], summary=None, titles={"experience": "Employment History"}),
    },
    "pipe_meta": {
        "layout": "pipe_meta", "section_style": "heading", "bullets": "▪",
        "header": {**MAYA_HEADER, "name": "Lena Hoffmann", "headline": "Operations Lead", "email": "lena.hoffmann@example.com"},
        "sections": _sections([
            job("Operations Lead", "Northwind Logistics", "Rotterdam", "Aug 2019", "Present", EN_BULLETS),
            job("Operations Coordinator", "Port Services BV", "Rotterdam", "2015", "2019", EN_BULLETS[:1]),
        ]),
    },
    "company_dates_only": {
        "layout": "tab", "section_style": "heading", "bullets": "list",
        "header": {**MAYA_HEADER, "name": "Sam Carter", "headline": "Freelance Writer", "email": "sam.carter@example.com"},
        "sections": _sections([
            job("Acme Media", None, None, "2019", "2022", []),
            job("Globex News", None, None, "Jan 2016", "Dec 2018", []),
        ]),
    },
    "accented": {
        "layout": "tab", "section_style": "heading", "bullets": "list",
        "header": {**MAYA_HEADER, "name": "Zoë Åström-Nuñez", "headline": "Développeuse front-end",
                   "location": "São Paulo, Brasil", "email": "zoe.astrom@example.com"},
        "sections": _sections([
            job("Développeuse front-end", "Café Müller", "São Paulo", "Mar 2022", "Present", EN_BULLETS),
            job("Desenvolvedora", "Łódź Software", "Łódź, PL", "Jan 2019", "Feb 2022", EN_BULLETS[:1]),
        ], education=[job("Licenciatura em Informática", "Universidade de São Paulo", "São Paulo", "2014", "2018", [])]),
    },
    "cyrillic": {
        "layout": "tab", "section_style": "heading", "bullets": "list",
        "header": {**MAYA_HEADER, "name": "Анастасия Ковальчук", "headline": "Старший фронтенд-разработчик",
                   "location": "Київ, Україна", "email": "anastasia@example.com"},
        "sections": _sections([
            job("Фронтенд-инженер", "Tulip Pay", "Амстердам", "мар 2022", "наст. время", RU_BULLETS),
            job("Веб-разработчик", "Яндекс", "Москва", "март 2019", "настоящее время", RU_BULLETS[:1], sep=" — "),
            job("Junior-разработчик", "Рамблер", "Санкт-Петербург", "янв 2016", "дек 2018", RU_BULLETS[:1]),
        ], education=[job("Бакалавр информатики", "Киевский политехнический институт", "Киев", "2012", "2016", [])],
            summary="Фронтенд-разработчик с пятилетним опытом.", skills="TypeScript, React, Node.js",
            titles={"summary": "О себе", "experience": "Профессиональный опыт", "education": "Образование", "skills": "Навыки"}),
    },
    "cyrillic_company_first": {
        "layout": "company_first", "section_style": "bold", "bullets": "•",
        "header": {**MAYA_HEADER, "name": "Иван Петров", "headline": "Руководитель проектов",
                   "location": "Москва", "email": "ivan.petrov@example.com"},
        "sections": _sections([
            job("Руководитель проектов", "ООО Ромашка", "Москва", "март 2020", "настоящее время", RU_BULLETS),
            job("Менеджер проектов", "АО Вектор", "Казань", "2016", "2020", RU_BULLETS[:1]),
        ], education=[job("Магистр менеджмента", "Казанский федеральный университет", None, "2012", "2016", [])],
            summary="Руководитель проектов с опытом более восьми лет.", skills="Scrum, Jira, Excel",
            titles={"summary": "Обо мне", "experience": "Опыт работы", "education": "Образование", "skills": "Ключевые навыки"}),
    },
}

# Maya as the model the classic template prints (also the PDF fixtures).
PDF_SPECS = ("date_formats", "company_first", "stacked", "comma_paren", "pipe_meta", "company_dates_only",
             "accented", "cyrillic", "cyrillic_company_first")
SOFFICE_SPECS = ("date_formats", "company_first", "stacked", "cyrillic")


def dates_text(entry) -> str:
    if not entry["start_date"]:
        return ""
    return f"{entry['start_date']}{entry['sep']}{entry['end_date']}" if entry["end_date"] else entry["start_date"]


def expected(spec: dict) -> list[dict]:
    """Kind, title and the fields every entry must read back (plain entries: only the text)."""
    out = []
    for section in spec["sections"]:
        entries = []
        for entry in section["entries"]:
            if "body" in entry:
                entries.append({"body": entry["body"]})
            else:
                entries.append({key: entry[key] for key in ("heading", "subheading", "location", "start_date", "end_date", "bullets")})
        out.append({"kind": section["kind"], "title": section["title"], "entries": entries})
    return out


# -- DOCX ----------------------------------------------------------------------------------


def _bullet(doc, style, text):
    if style == "list":
        doc.add_paragraph(text, style="List Bullet")
    else:
        doc.add_paragraph(f"{style} {text}")


def _write_entry(doc, layout, entry, bullet_style):
    h, s, loc, dt = entry["heading"], entry["subheading"], entry["location"], dates_text(entry)
    if layout == "tab":
        head = h if not s else f"{h} — {s}"
        doc.add_paragraph(f"{head}\t{dt}" if dt else head)
        if loc:
            doc.add_paragraph(loc)
    elif layout == "company_first":
        run = doc.add_paragraph().add_run(s or h)
        run.bold = True
        if s:
            doc.add_paragraph(f"{h} | {dt}" if dt else h)
        if loc:
            doc.add_paragraph(loc)
    elif layout == "stacked":
        for line in (h, s, dt, loc):
            if line:
                doc.add_paragraph(line)
    elif layout == "comma_paren":
        head = h if not s else f"{h}, {s}"
        doc.add_paragraph(f"{head} ({dt})" if dt else head)
        if loc:
            doc.add_paragraph(loc)
    elif layout == "pipe_meta":
        doc.add_paragraph(h)
        meta = " · ".join(part for part in (s, loc, dt) if part)
        doc.add_paragraph(meta)
    for bullet in entry["bullets"]:
        _bullet(doc, bullet_style, bullet)


def docx_bytes(spec: dict) -> bytes:
    doc = Document()
    for style_name in ("Normal", "Title", "Heading 1", "List Bullet"):
        doc.styles[style_name].font.name = "Arial"  # a font LibreOffice can print Cyrillic in
    doc.styles["Normal"].font.size = Pt(10.5)
    header = spec["header"]
    doc.add_paragraph(header["name"], style="Title")
    if header.get("headline"):
        doc.add_paragraph(header["headline"])
    doc.add_paragraph(" · ".join([header["location"], header["email"], header["phone"], *header["links"]]))
    for section in spec["sections"]:
        if spec["section_style"] == "heading":
            doc.add_paragraph(section["title"], style="Heading 1")
        else:
            doc.add_paragraph().add_run(section["title"].upper()).bold = True
        for entry in section["entries"]:
            if "body" in entry:
                doc.add_paragraph(entry["body"])
            else:
                _write_entry(doc, spec["layout"], entry, spec["bullets"])
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


# -- PDF -----------------------------------------------------------------------------------


def pdf_bytes(spec: dict, template: str = "classic") -> bytes:
    from app.schemas.cv_documents import CvStyle
    from app.services.cv_rendering import build_render_model, render_pdf
    from tests.cv_fixtures import entry, section

    sections = []
    for si, sec in enumerate(spec["sections"]):
        entries = []
        for ei, item in enumerate(sec["entries"]):
            if "body" in item:
                entries.append(entry(f"e{si}{ei}", ei, body=item["body"]))
            else:
                end = item["end_date"]
                entries.append(entry(f"e{si}{ei}", ei, heading=item["heading"], subheading=item["subheading"],
                                     location=item["location"], start_date=item["start_date"],
                                     end_date=end, bullets=item["bullets"]))
        sections.append(section(f"s{si}", sec["kind"], sec["title"], si, entries))
    cv = SimpleNamespace(name="CV", header=spec["header"], sections=sections)
    return render_pdf(build_render_model(cv, template, CvStyle()))


def soffice_pdf(docx: bytes) -> bytes | None:
    if not Path(SOFFICE).exists():
        return None
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "cv.docx"
        source.write_bytes(docx)
        subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(source)],
                       check=True, capture_output=True, timeout=120)
        return (Path(tmp) / "cv.pdf").read_bytes()


def write_fixtures() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, spec in SPECS.items():
        (FIXTURE_DIR / f"{name}.docx").write_bytes(docx_bytes(spec))
        if name in PDF_SPECS:
            (FIXTURE_DIR / f"{name}.classic.pdf").write_bytes(pdf_bytes(spec))
        if name in SOFFICE_SPECS:
            converted = soffice_pdf(docx_bytes(spec))
            if converted:
                (FIXTURE_DIR / f"{name}.soffice.pdf").write_bytes(converted)
    (FIXTURE_DIR / "expected.json").write_text(
        json.dumps({name: expected(spec) for name, spec in SPECS.items()}, ensure_ascii=False, indent=1) + "\n"
    )


if __name__ == "__main__":
    write_fixtures()
