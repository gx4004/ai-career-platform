"""Render Stage L thesis architecture figures as deterministic PNGs.

Graphviz is the preferred renderer for the checked-in DOT sources, but it is
not always available in the local thesis environment. This script keeps the
figures reproducible without image-generation models: it draws fixed-layout,
Times-styled diagrams whose labels match the DOT source semantics exactly.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "thesis" / "figures" / "v2"
FONT_REG = Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf")
FONT_BOLD = Path("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf")


@dataclass(frozen=True)
class Box:
    key: str
    x: int
    y: int
    w: int
    h: int
    label: str
    fill: str = "#ffffff"
    stroke: str = "#000000"
    weight: int = 3


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REG
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.truetype("DejaVuSerif-Bold.ttf" if bold else "DejaVuSerif.ttf", size)


F_TITLE = font(34, True)
F_NODE = font(20)
F_NODE_BOLD = font(21, True)
F_SMALL = font(18)
F_EDGE = font(17)
F_GROUP = font(20, True)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    if not text:
        return 0, 0
    box = draw.multiline_textbbox((0, 0), text, font=fnt, spacing=7, align="center")
    return box[2] - box[0], box[3] - box[1]


def wrap_label(label: str, width_chars: int) -> str:
    lines: list[str] = []
    for raw in label.split("\n"):
        if len(raw) <= width_chars:
            lines.append(raw)
        else:
            lines.extend(textwrap.wrap(raw, width=width_chars, break_long_words=False))
    return "\n".join(lines)


def draw_box(draw: ImageDraw.ImageDraw, b: Box, *, header: bool = False) -> None:
    draw.rectangle([b.x, b.y, b.x + b.w, b.y + b.h], fill=b.fill, outline=b.stroke, width=b.weight)
    lines = b.label.split("\n")
    if len(lines) > 1 and header:
        head = wrap_label(lines[0], max(14, b.w // 18))
        rest = "\n".join(wrap_label(line, max(16, b.w // 18)) for line in lines[1:])
        head_w, head_h = text_size(draw, head, F_NODE_BOLD)
        rest_w, rest_h = text_size(draw, rest, F_NODE)
        total_h = head_h + 8 + rest_h
        y = b.y + (b.h - total_h) // 2
        draw.text((b.x + b.w / 2, y), head, font=F_NODE_BOLD, fill="black", anchor="ma", align="center")
        draw.multiline_text((b.x + b.w / 2, y + head_h + 8), rest, font=F_NODE, fill="black", anchor="ma", spacing=7, align="center")
        return
    wrapped = wrap_label(b.label, max(16, b.w // 19))
    tw, th = text_size(draw, wrapped, F_NODE)
    draw.multiline_text((b.x + b.w / 2, b.y + (b.h - th) / 2), wrapped, font=F_NODE, fill="black", anchor="ma", spacing=7, align="center")


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, label: str | None = None, dashed: bool = False) -> None:
    sx, sy = start
    ex, ey = end
    if dashed:
        dash_line(draw, start, end, width=3)
    else:
        draw.line([start, end], fill="black", width=3)
    angle = math.atan2(ey - sy, ex - sx)
    size = 16
    pts = [
        (ex, ey),
        (ex - size * math.cos(angle - math.pi / 7), ey - size * math.sin(angle - math.pi / 7)),
        (ex - size * math.cos(angle + math.pi / 7), ey - size * math.sin(angle + math.pi / 7)),
    ]
    draw.polygon(pts, fill="black")
    if label:
        lx = (sx + ex) / 2
        ly = (sy + ey) / 2 - 18
        label_w, label_h = text_size(draw, label, F_EDGE)
        draw.rectangle([lx - label_w / 2 - 8, ly - label_h / 2 - 4, lx + label_w / 2 + 8, ly + label_h / 2 + 4], fill="white")
        draw.text((lx, ly - label_h / 2), label, font=F_EDGE, fill="black", anchor="ma")


def elbow(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], *, label: str | None = None, dashed: bool = False) -> None:
    for a, b in zip(points, points[1:]):
        if b == points[-1]:
            arrow(draw, a, b, dashed=dashed)
        elif dashed:
            dash_line(draw, a, b, width=3)
        else:
            draw.line([a, b], fill="black", width=3)
    if label:
        px, py = points[len(points) // 2]
        label_w, label_h = text_size(draw, label, F_EDGE)
        draw.rectangle([px - label_w / 2 - 8, py - label_h - 8, px + label_w / 2 + 8, py + 6], fill="white")
        draw.text((px, py - label_h - 4), label, font=F_EDGE, fill="black", anchor="ma")


def dash_line(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, width: int = 2) -> None:
    sx, sy = start
    ex, ey = end
    length = math.hypot(ex - sx, ey - sy)
    if length == 0:
        return
    dx = (ex - sx) / length
    dy = (ey - sy) / length
    dash = 16
    gap = 10
    pos = 0
    while pos < length:
        x1 = sx + dx * pos
        y1 = sy + dy * pos
        x2 = sx + dx * min(length, pos + dash)
        y2 = sy + dy * min(length, pos + dash)
        draw.line([(x1, y1), (x2, y2)], fill="black", width=width)
        pos += dash + gap


def group(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], label: str) -> None:
    x1, y1, x2, y2 = rect
    draw.rectangle(rect, fill="#fbfbfb", outline="black", width=2)
    lw, lh = text_size(draw, label, F_GROUP)
    draw.rectangle([x1 + 22, y1 - lh // 2 - 4, x1 + 38 + lw, y1 + lh // 2 + 4], fill="white")
    draw.text((x1 + 30, y1 - lh // 2), label, font=F_GROUP, fill="black")


def band(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], label: str) -> None:
    x1, y1, x2, y2 = rect
    draw.rectangle(rect, fill="#f7f7f7", outline="#555555", width=2)
    draw.text((x1 + 20, y1 + 16), label, font=F_GROUP, fill="black")


def save(img: Image.Image, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name, dpi=(300, 300))
    print(f"wrote {OUT / name}")


def figure_2_1() -> None:
    img = Image.new("RGB", (2200, 1250), "white")
    d = ImageDraw.Draw(img)

    band(d, (115, 90, 1605, 215), "Frontend client")
    band(d, (115, 270, 1605, 395), "API surface")
    band(d, (115, 450, 1605, 585), "Shared tool pipeline")
    band(d, (115, 640, 1605, 850), "Analytical core")
    band(d, (115, 905, 1605, 1105), "Persistence")

    boxes = {
        "client": Box("client", 520, 118, 470, 70, "React 19 + TanStack Start\nfrontend client", "#ffffff"),
        "routers": Box("routers", 350, 300, 330, 65, "FastAPI routers", "#ffffff"),
        "schemas": Box("schemas", 805, 300, 330, 65, "Pydantic schemas\nand dependencies", "#ffffff"),
        "pipeline": Box("pipeline", 330, 485, 925, 65, "run_tool_pipeline: sanitize -> cache -> service -> persist -> respond", "#ffffff"),
        "services": Box("services", 235, 678, 390, 135, "Tool services\nresume, job_match, cover_letter\ninterview, career, portfolio", "#ffffff"),
        "prompts": Box("prompts", 735, 652, 275, 80, "Prompt builders\napp/prompts/*.py", "#ffffff"),
        "heuristic": Box("heuristic", 735, 770, 275, 90, "Heuristic prepass v2\nquality_signals_v2.py", "#ffffff"),
        "gateway": Box("gateway", 1120, 728, 250, 80, "LLM gateway\nai_client.py", "#ffffff"),
        "repo": Box("repo", 260, 955, 270, 115, "Repository layer\nhistory, users, workspaces", "#ffffff"),
        "orm": Box("orm", 650, 955, 270, 115, "SQLAlchemy 2.0 ORM\nAlembic migrations", "#ffffff"),
        "db": Box("db", 1040, 945, 335, 130, "PostgreSQL\nusers, tool_runs,\nrefresh_tokens, workspaces", "#ffffff"),
        "auth": Box("auth", 1745, 420, 310, 80, "Auth helpers\nJWT, bcrypt, Google OAuth", "#ffffff"),
        "shared_cache": Box("shared_cache", 1745, 535, 310, 80, "Cache service\ncontent-hash lookup", "#ffffff"),
        "vertex": Box("vertex", 1745, 720, 330, 95, "Vertex AI Gemini 2.5 Flash\nstructured-output JSON", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)

    d.text((1745, 365), "Cross-cutting helpers", font=F_GROUP, fill="black")
    d.line([(1735, 388), (2075, 388)], fill="black", width=2)
    d.text((1745, 670), "External dependency", font=F_GROUP, fill="black")
    d.line([(1735, 693), (2075, 693)], fill="black", width=2)

    arrow(d, (170, 215), (170, 270))
    arrow(d, (170, 395), (170, 450))
    arrow(d, (170, 585), (170, 640))
    arrow(d, (170, 850), (170, 905))
    arrow(d, (680, 332), (805, 332))
    arrow(d, (795, 215), (795, 270))
    arrow(d, (795, 395), (795, 450))
    arrow(d, (530, 1010), (650, 1010))
    arrow(d, (920, 1010), (1040, 1010))
    elbow(d, [(625, 745), (680, 745), (680, 692), (735, 692)])
    elbow(d, [(625, 745), (680, 745), (680, 815), (735, 815)])
    elbow(d, [(625, 745), (1080, 745), (1080, 768), (1120, 768)])
    arrow(d, (1370, 768), (1745, 767))
    arrow(d, (1255, 517), (1745, 460), dashed=True)
    arrow(d, (1255, 517), (1745, 575), dashed=True)
    save(img, "figure-2-1.png")


def figure_2_2() -> None:
    img = Image.new("RGB", (2400, 1250), "white")
    d = ImageDraw.Draw(img)
    d.text((95, 80), "run_tool_pipeline", font=F_GROUP, fill="black")
    d.line([(90, 105), (2310, 105)], fill="black", width=2)
    boxes = {
        "request": Box("request", 90, 190, 230, 105, "HTTP POST\n/tool run", "#ffffff"),
        "sanitize": Box("sanitize", 405, 180, 245, 125, "1. Sanitize\nstrip · trim · normalise", "#f7f7f7"),
        "cache": Box("cache", 735, 180, 245, 125, "2. Cache lookup\ncontent hash", "#ffffff"),
        "service": Box("service", 1065, 180, 245, 125, "3. Service call\ntool coroutine", "#f7f7f7"),
        "persist": Box("persist", 1395, 180, 245, 125, "4. Persist\nToolRun record", "#f7f7f7"),
        "respond": Box("respond", 1725, 180, 245, 125, "5. Respond\nresult + history_id", "#f7f7f7"),
        "success": Box("success", 2055, 190, 230, 105, "HTTP 200\nresponse", "#ffffff"),
        "prepass": Box("prepass", 865, 540, 265, 105, "Heuristic prepass v2\nlocal evidence", "#ffffff"),
        "llm": Box("llm", 1245, 540, 300, 105, "Vertex AI Gemini 2.5 Flash\n4 retries", "#ffffff"),
        "fallback": Box("fallback", 1655, 540, 300, 105, "Heuristic-only fallback\nconfidence_note", "#ffffff"),
        "db": Box("db", 1395, 855, 245, 105, "PostgreSQL\ntool_runs", "#ffffff"),
        "observe": Box("observe", 405, 855, 460, 105, "Observability\nstart, success, failure events", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)
    d.text((880, 475), "Expanded service stage", font=F_GROUP, fill="black")
    d.line([(870, 498), (1960, 498)], fill="black", width=2)
    d.text((405, 810), "Operational side effects", font=F_GROUP, fill="black")
    d.line([(395, 833), (1640, 833)], fill="black", width=2)
    arrow(d, (320, 242), (405, 242))
    arrow(d, (650, 242), (735, 242))
    arrow(d, (980, 242), (1065, 242), label="miss")
    arrow(d, (1310, 242), (1395, 242))
    arrow(d, (1640, 242), (1725, 242))
    arrow(d, (1970, 242), (2055, 242))
    elbow(d, [(858, 180), (858, 140), (1848, 140), (1848, 180)], label="cache hit")
    arrow(d, (1188, 305), (998, 540))
    arrow(d, (1130, 592), (1245, 592))
    arrow(d, (1545, 592), (1655, 592), label="retries fail")
    elbow(d, [(1805, 540), (1805, 430), (1518, 430), (1518, 305)])
    arrow(d, (1518, 305), (1518, 855))
    save(img, "figure-2-2.png")


def figure_2_3() -> None:
    img = Image.new("RGB", (2200, 1250), "white")
    d = ImageDraw.Draw(img)
    group(d, (120, 70, 2080, 780), "Railway project: single hostname, path-based routing")
    group(d, (120, 850, 1120, 1175), "Data and external services")
    group(d, (1220, 850, 2080, 1175), "Observability")
    boxes = {
        "browser": Box("browser", 880, 120, 440, 95, "Browser\nthecareerworkbench.com", "#ffffff"),
        "cf": Box("cf", 880, 270, 440, 100, "Cloudflare DNS + TLS\nA record to Railway edge", "#ffffff"),
        "edge": Box("edge", 880, 430, 440, 100, "Railway edge proxy\nHTTPS termination", "#f7f7f7"),
        "fe": Box("fe", 360, 650, 420, 105, "Frontend service\nVite SSR · Node 20", "#f7f7f7"),
        "be": Box("be", 1420, 650, 420, 105, "Backend service\nFastAPI · uvicorn · Python 3.11", "#f7f7f7"),
        "pg": Box("pg", 180, 930, 280, 95, "Railway PostgreSQL\nmanaged add-on", "#ffffff"),
        "vertex": Box("vertex", 500, 930, 280, 95, "Google Vertex AI\nGemini 2.5 Flash", "#ffffff"),
        "resend": Box("resend", 820, 930, 240, 95, "Resend\npassword reset", "#ffffff"),
        "sentry": Box("sentry", 1300, 930, 300, 95, "Sentry free tier\nerror tracking", "#ffffff"),
        "metrics": Box("metrics", 1680, 930, 300, 95, "Railway metrics\nCPU, memory, requests", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)
    arrow(d, (1100, 215), (1100, 270))
    arrow(d, (1100, 370), (1100, 430))
    elbow(d, [(1100, 530), (1100, 590), (570, 590), (570, 650)], label="/")
    elbow(d, [(1100, 530), (1100, 590), (1630, 590), (1630, 650)], label="/api/v1/*")
    elbow(d, [(1630, 755), (1630, 820), (320, 820), (320, 930)])
    elbow(d, [(1630, 755), (1630, 820), (640, 820), (640, 930)], label="LLM")
    elbow(d, [(1630, 755), (1630, 820), (940, 820), (940, 930)], label="email")
    elbow(d, [(1630, 755), (1630, 805), (1450, 805), (1450, 930)], label="errors", dashed=True)
    elbow(d, [(1630, 755), (1630, 790), (1830, 790), (1830, 930)], label="metrics", dashed=True)
    save(img, "figure-2-3.png")


def main() -> None:
    figure_2_1()
    figure_2_2()
    figure_2_3()


if __name__ == "__main__":
    main()
