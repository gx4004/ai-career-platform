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


F_TITLE = font(48, True)
F_NODE = font(34)
F_NODE_BOLD = font(36, True)
F_SMALL = font(28)
F_EDGE = font(28)
F_GROUP = font(34, True)


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
        head = wrap_label(lines[0], max(10, b.w // 24))
        rest = "\n".join(wrap_label(line, max(12, b.w // 24)) for line in lines[1:])
        head_w, head_h = text_size(draw, head, F_NODE_BOLD)
        rest_w, rest_h = text_size(draw, rest, F_NODE)
        total_h = head_h + 8 + rest_h
        y = b.y + (b.h - total_h) // 2
        draw.text((b.x + b.w / 2, y), head, font=F_NODE_BOLD, fill="black", anchor="ma", align="center")
        draw.multiline_text((b.x + b.w / 2, y + head_h + 8), rest, font=F_NODE, fill="black", anchor="ma", spacing=7, align="center")
        return
    wrapped = wrap_label(b.label, max(10, b.w // 24))
    tw, th = text_size(draw, wrapped, F_NODE)
    draw.multiline_text((b.x + b.w / 2, b.y + (b.h - th) / 2), wrapped, font=F_NODE, fill="black", anchor="ma", spacing=7, align="center")


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, label: str | None = None, dashed: bool = False) -> None:
    sx, sy = start
    ex, ey = end
    if dashed:
        dash_line(draw, start, end, width=5)
    else:
        draw.line([start, end], fill="black", width=5)
    angle = math.atan2(ey - sy, ex - sx)
    size = 24
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
            dash_line(draw, a, b, width=5)
        else:
            draw.line([a, b], fill="black", width=5)
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
    dash = 22
    gap = 14
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
    bbox = draw.textbbox((0, 0), label, font=F_GROUP)
    lw = bbox[2] - bbox[0]
    draw.rectangle([x1 + 20, y1 - 42, x1 + lw + 58, y1 + 22], fill="white")
    draw.text((x1 + 30, y1 - 34), label, font=F_GROUP, fill="black")


def band(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], label: str) -> None:
    x1, y1, x2, y2 = rect
    draw.rectangle(rect, fill="#f7f7f7", outline="#555555", width=2)
    bbox = draw.textbbox((0, 0), label, font=F_GROUP)
    lw = bbox[2] - bbox[0]
    draw.rectangle([x1 + 18, y1 - 4, x1 + lw + 52, y1 + 44], fill="#f7f7f7")
    draw.text((x1 + 26, y1 + 4), label, font=F_GROUP, fill="black")


def save(img: Image.Image, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name, dpi=(300, 300))
    print(f"wrote {OUT / name}")


def figure_2_1() -> None:
    img = Image.new("RGB", (1800, 1300), "white")
    d = ImageDraw.Draw(img)

    band(d, (90, 70, 1350, 190), "Client")
    band(d, (90, 245, 1350, 390), "API surface")
    band(d, (90, 445, 1350, 590), "Shared pipeline")
    band(d, (90, 645, 1350, 870), "Analytical core")
    band(d, (90, 925, 1350, 1145), "Persistence")

    boxes = {
        "client": Box("client", 470, 92, 500, 75, "React frontend", "#ffffff"),
        "routers": Box("routers", 245, 280, 390, 82, "FastAPI routers", "#ffffff"),
        "schemas": Box("schemas", 805, 280, 390, 82, "Pydantic schemas", "#ffffff"),
        "pipeline": Box("pipeline", 300, 480, 840, 82, "run_tool_pipeline", "#ffffff"),
        "services": Box("services", 170, 700, 365, 120, "Tool services\n6 user tools", "#ffffff"),
        "heuristic": Box("heuristic", 620, 700, 335, 120, "Heuristic prepass\nlocal scoring", "#ffffff"),
        "gateway": Box("gateway", 1040, 700, 270, 120, "LLM gateway\nai_client.py", "#ffffff"),
        "repo": Box("repo", 160, 985, 310, 110, "Repository layer", "#ffffff"),
        "orm": Box("orm", 565, 985, 310, 110, "SQLAlchemy ORM", "#ffffff"),
        "db": Box("db", 970, 980, 330, 120, "PostgreSQL\nRailway DB", "#ffffff"),
        "auth": Box("auth", 1450, 350, 270, 100, "Auth\nJWT + OAuth", "#ffffff"),
        "cache": Box("cache", 1450, 505, 270, 100, "Cache\ncontent hash", "#ffffff"),
        "vertex": Box("vertex", 1450, 700, 270, 120, "Vertex AI\nGemini Flash", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)

    d.text((1450, 300), "Cross-cutting", font=F_GROUP, fill="black")
    d.text((1450, 650), "External", font=F_GROUP, fill="black")

    arrow(d, (720, 190), (720, 245))
    arrow(d, (635, 321), (805, 321))
    arrow(d, (720, 390), (720, 445))
    arrow(d, (720, 590), (720, 645))
    arrow(d, (535, 760), (620, 760))
    arrow(d, (955, 760), (1040, 760))
    arrow(d, (1310, 760), (1450, 760))
    arrow(d, (470, 1040), (565, 1040))
    arrow(d, (875, 1040), (970, 1040))
    elbow(d, [(1140, 521), (1420, 521), (1420, 400), (1450, 400)], dashed=True)
    elbow(d, [(1140, 521), (1420, 521), (1420, 555), (1450, 555)], dashed=True)
    save(img, "figure-2-1.png")


def figure_2_2() -> None:
    img = Image.new("RGB", (1800, 1300), "white")
    d = ImageDraw.Draw(img)
    d.text((95, 70), "run_tool_pipeline", font=F_GROUP, fill="black")
    boxes = {
        "sanitize": Box("sanitize", 130, 165, 410, 95, "1  Sanitize input", "#f7f7f7"),
        "cache": Box("cache", 130, 325, 410, 95, "2  Cache lookup", "#ffffff"),
        "service": Box("service", 130, 485, 410, 95, "3  Service call", "#f7f7f7"),
        "persist": Box("persist", 130, 645, 410, 95, "4  Persist result", "#f7f7f7"),
        "respond": Box("respond", 130, 805, 410, 95, "5  Respond", "#f7f7f7"),
        "observe": Box("observe", 130, 965, 410, 95, "6  Observe", "#ffffff"),
        "prepass": Box("prepass", 820, 375, 410, 105, "Heuristic prepass\nlocal evidence", "#ffffff"),
        "llm": Box("llm", 820, 565, 410, 105, "Gemini call\n4 retries", "#ffffff"),
        "fallback": Box("fallback", 820, 755, 410, 105, "Fallback\nheuristic-only", "#ffffff"),
        "db": Box("db", 1335, 645, 310, 95, "PostgreSQL\ntool_runs", "#ffffff"),
        "events": Box("events", 820, 965, 410, 95, "Events\nstart/success/failure", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)
    d.text((820, 300), "Inside the service stage", font=F_GROUP, fill="black")
    d.text((820, 920), "Operational records", font=F_GROUP, fill="black")
    arrow(d, (335, 260), (335, 325))
    arrow(d, (335, 420), (335, 485))
    arrow(d, (335, 580), (335, 645))
    arrow(d, (335, 740), (335, 805))
    arrow(d, (335, 900), (335, 965))
    arrow(d, (540, 532), (820, 428))
    arrow(d, (1025, 480), (1025, 565))
    arrow(d, (1025, 670), (1025, 755))
    arrow(d, (540, 692), (1335, 692))
    arrow(d, (540, 1012), (820, 1012), dashed=True)
    save(img, "figure-2-2.png")


def figure_2_3() -> None:
    img = Image.new("RGB", (1800, 1250), "white")
    d = ImageDraw.Draw(img)
    group(d, (100, 70, 1700, 780), "Railway project: single hostname, path-based routing")
    boxes = {
        "browser": Box("browser", 650, 125, 500, 90, "Browser\nsingle hostname", "#ffffff"),
        "cf": Box("cf", 650, 285, 500, 90, "Cloudflare DNS + TLS", "#ffffff"),
        "edge": Box("edge", 650, 445, 500, 90, "Railway edge proxy", "#f7f7f7"),
        "fe": Box("fe", 250, 645, 430, 105, "Frontend service\nVite SSR", "#f7f7f7"),
        "be": Box("be", 1120, 645, 430, 105, "Backend service\nFastAPI", "#f7f7f7"),
        "pg": Box("pg", 155, 930, 285, 95, "PostgreSQL\nmanaged", "#ffffff"),
        "vertex": Box("vertex", 500, 930, 285, 95, "Vertex AI\nGemini", "#ffffff"),
        "resend": Box("resend", 845, 930, 215, 95, "Resend\nemail", "#ffffff"),
        "sentry": Box("sentry", 1225, 930, 205, 95, "Sentry\nerrors", "#ffffff"),
        "metrics": Box("metrics", 1470, 930, 205, 95, "Railway\nmetrics", "#ffffff"),
    }
    for b in boxes.values():
        draw_box(d, b, header=True)
    arrow(d, (900, 215), (900, 285))
    arrow(d, (900, 375), (900, 445))
    elbow(d, [(900, 535), (900, 585), (465, 585), (465, 645)], label="/")
    elbow(d, [(900, 535), (900, 585), (1335, 585), (1335, 645)], label="/api/v1/*")
    elbow(d, [(1335, 750), (1335, 820), (298, 820), (298, 930)])
    elbow(d, [(1335, 750), (1335, 820), (642, 820), (642, 930)], label="LLM")
    elbow(d, [(1335, 750), (1335, 820), (952, 820), (952, 930)], label="email")
    elbow(d, [(1335, 750), (1335, 820), (1328, 820), (1328, 930)], label="errors", dashed=True)
    elbow(d, [(1335, 750), (1335, 805), (1572, 805), (1572, 930)], label="metrics", dashed=True)
    save(img, "figure-2-3.png")


def main() -> None:
    figure_2_1()
    figure_2_2()
    figure_2_3()


if __name__ == "__main__":
    main()
