#!/usr/bin/env python3
"""Generate a review-only icon batch for the AI Career Platform.

Creates multiple large icon candidates plus smaller preview thumbnails for each
tool icon and stores everything under pics/review-icons/.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from generate_vertex_brand_assets import (
    ASSETS,
    ROOT,
    build_client,
    detect_project,
    evaluate_candidate,
    fit_image,
    maybe_generate_with_fallback,
)

REVIEW_DIR = ROOT / "pics" / "review-icons"
TOOLS = [asset for asset in ASSETS if asset.category == "tools"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=None)
    parser.add_argument("--location", default="us-central1")
    parser.add_argument(
        "--batches",
        type=int,
        default=2,
        help="Number of 4-image Imagen batches per tool icon.",
    )
    parser.add_argument(
        "--thumb-size",
        type=int,
        default=256,
        help="Size of the smaller square review icons.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=2.0,
        help="Delay between API calls to avoid bursty quota errors.",
    )
    return parser.parse_args()


def ensure_directories() -> None:
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for tool in TOOLS:
        (REVIEW_DIR / tool.filename.removesuffix(".png")).mkdir(parents=True, exist_ok=True)


def save_image_variant(data: bytes, output_path: Path, size: tuple[int, int]) -> None:
    image = Image.open(BytesIO(data))
    fitted = fit_image(image, size)
    fitted.save(output_path, format="PNG")


def save_small_preview(source_path: Path, output_path: Path, thumb_size: int) -> None:
    image = Image.open(source_path)
    fitted = fit_image(image, (thumb_size, thumb_size))
    fitted.save(output_path, format="PNG")


def render_contact_sheet(tool_dir: Path, items: list[dict[str, Any]], thumb_size: int) -> None:
    columns = 4
    rows = math.ceil(len(items) / columns)
    gutter = 20
    header = 54
    width = columns * thumb_size + gutter * (columns + 1)
    height = rows * (thumb_size + 34) + gutter * (rows + 1) + header
    sheet = Image.new("RGB", (width, height), "#0f1a2e")
    draw = ImageDraw.Draw(sheet)

    title = f"{tool_dir.name} review"
    draw.text((gutter, 18), title, fill="#edf6ff")
    draw.text((gutter, 34), "full-size + small-preview candidates", fill="#8fb5d6")

    for index, item in enumerate(items):
        row = index // columns
        column = index % columns
        x = gutter + column * (thumb_size + gutter)
        y = header + gutter + row * (thumb_size + 34 + gutter)

        thumb = Image.open(tool_dir / item["thumb"])
        sheet.paste(thumb.convert("RGB"), (x, y))
        label = f"{item['name']}  score {item['score']:.2f}"
        draw.text((x, y + thumb_size + 10), label, fill="#d7ebff")

    sheet.save(tool_dir / "sheet.png", format="PNG")


def process_tool(
    client,
    tool,
    batches: int,
    thumb_size: int,
    sleep_seconds: float,
) -> dict[str, Any]:
    tool_name = tool.filename.removesuffix(".png")
    tool_dir = REVIEW_DIR / tool_name
    print(f"\nGenerating review set for {tool.filename}...")

    all_items: list[dict[str, Any]] = []
    model_used = None
    variant_index = 1

    for batch_index in range(batches):
        model, candidates = maybe_generate_with_fallback(client, tool, None)
        model_used = model
        for candidate in candidates:
            large_name = f"candidate-{variant_index:02d}.png"
            small_name = f"candidate-{variant_index:02d}-small.png"
            large_path = tool_dir / large_name
            small_path = tool_dir / small_name
            save_image_variant(candidate, large_path, tool.target_size)
            save_small_preview(large_path, small_path, thumb_size)
            metrics = evaluate_candidate(large_path, tool)
            all_items.append(
                {
                    "name": f"#{variant_index:02d}",
                    "file": large_name,
                    "thumb": small_name,
                    "score": metrics["score"],
                    "metrics": metrics,
                }
            )
            print(f"  candidate {variant_index:02d}: score={metrics['score']:.4f}")
            variant_index += 1

        if batch_index < batches - 1 and sleep_seconds > 0:
            time.sleep(sleep_seconds)

    ranked = sorted(all_items, key=lambda item: item["score"], reverse=True)
    render_contact_sheet(tool_dir, ranked, thumb_size)

    return {
        "tool": tool.filename,
        "folder": str(tool_dir.relative_to(ROOT)),
        "model": model_used,
        "candidate_count": len(all_items),
        "thumb_size": thumb_size,
        "top_candidates": [
            {"file": item["file"], "thumb": item["thumb"], "score": item["score"]}
            for item in ranked[:3]
        ],
        "candidates": ranked,
    }


def write_manifest(project: str, location: str, items: list[dict[str, Any]]) -> None:
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": project,
        "location": location,
        "review_folder": str(REVIEW_DIR.relative_to(ROOT)),
        "tool_count": len(items),
        "tools": items,
    }
    (REVIEW_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    project = detect_project(args.project)
    ensure_directories()
    client = build_client(project, args.location)

    results = []
    for index, tool in enumerate(TOOLS):
        results.append(process_tool(client, tool, args.batches, args.thumb_size, args.sleep_seconds))
        if index < len(TOOLS) - 1 and args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    write_manifest(project, args.location, results)
    print(
        f"\nFinished. Saved review icons for {len(results)} tools under "
        f"{REVIEW_DIR.relative_to(ROOT)}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
