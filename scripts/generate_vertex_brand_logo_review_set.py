#!/usr/bin/env python3
"""Generate review-only Career Workbench brand logo concepts.

This script creates multiple large square brand-mark concepts via Vertex Imagen,
exports smaller favicon-sized previews, and builds larger lockup previews for
"Career Workbench" without touching the website.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from generate_vertex_brand_assets import (
    ROOT,
    build_client,
    detect_project,
    fit_image,
    maybe_generate_with_fallback,
    evaluate_candidate,
    AssetSpec,
)

REVIEW_DIR = ROOT / "pics" / "review-branding"

MARK_SPEC = AssetSpec(
    category="branding",
    filename="career-workbench-mark-review.png",
    aspect_ratio="1:1",
    target_size=(512, 512),
    image_size="1K",
    brightness_target=0.38,
    saturation_target=0.38,
    coverage_target={
        "navy_1": 0.26,
        "navy_2": 0.22,
        "mint": 0.16,
        "lime": 0.10,
        "blue": 0.26,
    },
    prompt=(
        "Brand icon concept for Career Workbench. A premium square SaaS app mark, "
        "centered symbol inspired by the letters C and W using elegant geometric "
        "strokes, interlocking ribbon forms, or glass paths. Strong, recognizable, "
        "minimal silhouette. Deep navy base with mint, lime, and electric blue "
        "aurora glow. Frosted glass depth, polished 3D render, no readable text."
    ),
)

MARK_DIR = REVIEW_DIR / "mark"
LOCKUP_DIR = REVIEW_DIR / "lockup"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=None)
    parser.add_argument("--location", default="us-central1")
    parser.add_argument(
        "--total-candidates",
        type=int,
        default=12,
        help="Total number of review candidates to keep, including any existing ones.",
    )
    parser.add_argument("--small-size", type=int, default=64, help="Mini logo output size.")
    parser.add_argument(
        "--lockup-size",
        default="880x176",
        help="Large lockup preview size in WIDTHxHEIGHT format.",
    )
    parser.add_argument("--sleep-seconds", type=float, default=2.0)
    return parser.parse_args()


def ensure_directories() -> None:
    MARK_DIR.mkdir(parents=True, exist_ok=True)
    LOCKUP_DIR.mkdir(parents=True, exist_ok=True)


def parse_size(value: str) -> tuple[int, int]:
    width, height = value.lower().split("x", 1)
    return int(width), int(height)


def save_mark_image(data: bytes, output_path: Path) -> None:
    image = Image.open(BytesIO(data))
    fitted = fit_image(image, MARK_SPEC.target_size)
    fitted.save(output_path, format="PNG")


def save_small_mark(source_path: Path, output_path: Path, size: int) -> None:
    image = Image.open(source_path)
    fitted = fit_image(image, (size, size))
    fitted.save(output_path, format="PNG")


def resolve_font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def compose_lockup(mark_path: Path, output_path: Path, size: tuple[int, int]) -> None:
    width, height = size
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))

    bg = Image.new("RGBA", size, "#f7fbff")
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.rounded_rectangle(
        [(1, 1), (width - 2, height - 2)],
        radius=28,
        outline=(209, 226, 242, 255),
        width=2,
        fill=(247, 251, 255, 245),
    )
    canvas.alpha_composite(bg)

    mark = Image.open(mark_path).convert("RGBA")
    mark_size = int(height * 0.72)
    mark = fit_image(mark, (mark_size, mark_size))
    mark_x = int(height * 0.18)
    mark_y = (height - mark_size) // 2
    canvas.alpha_composite(mark, (mark_x, mark_y))

    draw = ImageDraw.Draw(canvas)
    career_font = resolve_font(True, int(height * 0.30))
    workbench_font = resolve_font(False, int(height * 0.30))

    text_x = mark_x + mark_size + int(height * 0.18)
    career_y = int(height * 0.29)
    workbench_y = int(height * 0.53)

    draw.text((text_x, career_y), "Career", font=career_font, fill="#334155")
    draw.text((text_x, workbench_y), "Workbench", font=workbench_font, fill="#536476")

    canvas.save(output_path, format="PNG")


def render_sheet(sheet_path: Path, items: list[dict], thumb_key: str, title: str, bg_color: str) -> None:
    thumb = Image.open(items[0][thumb_key])
    thumb_width, thumb_height = thumb.size
    columns = 4
    rows = math.ceil(len(items) / columns)
    gutter = 20
    header = 60
    width = columns * thumb_width + gutter * (columns + 1)
    height = rows * (thumb_height + 34) + gutter * (rows + 1) + header
    sheet = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(sheet)
    draw.text((gutter, 18), title, fill="#edf6ff" if bg_color == "#0f1a2e" else "#16324b")
    draw.text((gutter, 36), "review candidates ranked by palette score", fill="#8fb5d6")

    for index, item in enumerate(items):
        row = index // columns
        column = index % columns
        x = gutter + column * (thumb_width + gutter)
        y = header + gutter + row * (thumb_height + 34 + gutter)
        image = Image.open(item[thumb_key]).convert("RGB")
        sheet.paste(image, (x, y))
        draw.text((x, y + thumb_height + 10), f"{item['name']}  {item['score']:.2f}", fill="#d7ebff")

    sheet.save(sheet_path, format="PNG")


def load_existing_items() -> list[dict]:
    existing: list[dict] = []
    pattern = re.compile(r"candidate-(\d{2})\.png$")
    for mark_path in sorted(MARK_DIR.glob("candidate-*.png")):
        match = pattern.match(mark_path.name)
        if not match:
            continue
        name = f"candidate-{match.group(1)}"
        small_path = MARK_DIR / f"{name}-small.png"
        lockup_path = LOCKUP_DIR / f"{name}-lockup.png"
        if not small_path.exists() or not lockup_path.exists():
            continue
        metrics = evaluate_candidate(mark_path, MARK_SPEC)
        existing.append(
            {
                "name": name,
                "mark": str(mark_path.relative_to(ROOT)),
                "mark_small": str(small_path.relative_to(ROOT)),
                "lockup": str(lockup_path.relative_to(ROOT)),
                "score": metrics["score"],
                "metrics": metrics,
            }
        )
    return existing


def main() -> int:
    args = parse_args()
    project = detect_project(args.project)
    lockup_size = parse_size(args.lockup_size)
    ensure_directories()
    client = build_client(project, args.location)

    items = load_existing_items()
    index_counter = len(items) + 1
    model_used = None

    print("Generating Career Workbench logo review set...")
    if items:
        print(f"Found {len(items)} existing candidates. Resuming from {index_counter:02d}.")

    while len(items) < args.total_candidates:
        model, candidates = maybe_generate_with_fallback(client, MARK_SPEC, None)
        model_used = model
        for candidate in candidates:
            if len(items) >= args.total_candidates:
                break
            name = f"candidate-{index_counter:02d}"
            mark_path = MARK_DIR / f"{name}.png"
            mark_small_path = MARK_DIR / f"{name}-small.png"
            lockup_path = LOCKUP_DIR / f"{name}-lockup.png"

            save_mark_image(candidate, mark_path)
            save_small_mark(mark_path, mark_small_path, args.small_size)
            compose_lockup(mark_path, lockup_path, lockup_size)
            metrics = evaluate_candidate(mark_path, MARK_SPEC)

            items.append(
                {
                    "name": name,
                    "mark": str(mark_path.relative_to(ROOT)),
                    "mark_small": str(mark_small_path.relative_to(ROOT)),
                    "lockup": str(lockup_path.relative_to(ROOT)),
                    "score": metrics["score"],
                    "metrics": metrics,
                }
            )
            print(f"  {name}: score={metrics['score']:.4f}")
            index_counter += 1

        if len(items) < args.total_candidates and args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    ranked = sorted(items, key=lambda item: item["score"], reverse=True)

    render_sheet(
        MARK_DIR / "sheet.png",
        [{"name": i["name"], "score": i["score"], "thumb": ROOT / i["mark_small"]} for i in ranked],
        "thumb",
        "Career Workbench mini mark review",
        "#0f1a2e",
    )
    render_sheet(
        LOCKUP_DIR / "sheet.png",
        [{"name": i["name"], "score": i["score"], "thumb": ROOT / i["lockup"]} for i in ranked],
        "thumb",
        "Career Workbench lockup review",
        "#16324b",
    )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": project,
        "location": args.location,
        "review_folder": str(REVIEW_DIR.relative_to(ROOT)),
        "model": model_used,
        "candidate_count": len(ranked),
        "mark_large_size": list(MARK_SPEC.target_size),
        "mark_small_size": [args.small_size, args.small_size],
        "lockup_size": list(lockup_size),
        "top_candidates": [
            {
                "name": item["name"],
                "mark": item["mark"],
                "mark_small": item["mark_small"],
                "lockup": item["lockup"],
                "score": item["score"],
            }
            for item in ranked[:5]
        ],
        "candidates": ranked,
    }
    (REVIEW_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"\nFinished. Saved brand review candidates under {REVIEW_DIR.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
