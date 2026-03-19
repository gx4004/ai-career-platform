#!/usr/bin/env python3
"""Generate the AI Career Platform image suite with Vertex AI Imagen.

This script creates four candidate images per asset, scores each candidate
against the product's aurora palette, and saves the best-scoring PNG to
the requested pics/ subdirectory.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent.parent
PICS_DIR = ROOT / "pics"
VARIANTS_DIR = PICS_DIR / "_variants"

PROJECT_NAME = "AI Career Platform"
LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
MODEL_CANDIDATES = [
    os.environ.get("VERTEX_IMAGEN_MODEL"),
    "imagen-4.0-generate-001",
    "imagen-3.0-generate-002",
]

SHARED_STYLE = (
    f"Premium high-fidelity 3D abstract glass render for {PROJECT_NAME}. "
    "Glassmorphism and aurora aesthetic. "
    "Deep navy blue environment using #0f1a2e and #16324b. "
    "Aurora gradients shifting from mint green #35DA9E to lime green #A3E560 "
    "to electric blue #0a66c2. "
    "Frosted glass, translucent layered geometry, glowing edges, subtle grain, "
    "soft volumetric lighting, polished reflections, professional futuristic SaaS mood. "
    "Digital art, 3D render, high definition, studio-quality composition. "
    "No readable text, no logos, no watermark, no people, no hands."
)

NEGATIVE_PROMPT = (
    "readable text, letters, words, logo, watermark, person, face, hands, "
    "photography, realistic human, flat illustration, cartoon, low resolution, "
    "muddy colors, busy background, clutter, oversaturated neon, orange, red, pink"
)

PALETTE = {
    "navy_1": np.array([0x0F, 0x1A, 0x2E], dtype=np.float32) / 255.0,
    "navy_2": np.array([0x16, 0x32, 0x4B], dtype=np.float32) / 255.0,
    "mint": np.array([0x35, 0xDA, 0x9E], dtype=np.float32) / 255.0,
    "lime": np.array([0xA3, 0xE5, 0x60], dtype=np.float32) / 255.0,
    "blue": np.array([0x0A, 0x66, 0xC2], dtype=np.float32) / 255.0,
}

ACCENT_KEYS = ("mint", "lime", "blue")
BACKGROUND_KEYS = ("navy_1", "navy_2")


@dataclass(frozen=True)
class AssetSpec:
    category: str
    filename: str
    aspect_ratio: str
    target_size: tuple[int, int]
    image_size: str
    brightness_target: float
    saturation_target: float
    coverage_target: dict[str, float]
    prompt: str

    @property
    def output_path(self) -> Path:
        return PICS_DIR / self.category / self.filename

    @property
    def variant_dir(self) -> Path:
        return VARIANTS_DIR / self.category / self.filename.removesuffix(".png")


ASSETS: list[AssetSpec] = [
    AssetSpec(
        category="branding",
        filename="hero-main.png",
        aspect_ratio="16:9",
        target_size=(1920, 1080),
        image_size="2K",
        brightness_target=0.36,
        saturation_target=0.42,
        coverage_target={
            "navy_1": 0.26,
            "navy_2": 0.26,
            "mint": 0.16,
            "lime": 0.15,
            "blue": 0.17,
        },
        prompt=(
            "Website hero background. Abstract aurora waves moving through tall "
            "distorted frosted glass panels. Wide cinematic banner composition, "
            "smooth flowing ribbons of mint, lime, and electric blue seen through "
            "glass structures, soft atmospheric depth, elegant empty space, no text."
        ),
    ),
    AssetSpec(
        category="branding",
        filename="auth-bg.png",
        aspect_ratio="16:9",
        target_size=(1920, 1080),
        image_size="2K",
        brightness_target=0.20,
        saturation_target=0.28,
        coverage_target={
            "navy_1": 0.42,
            "navy_2": 0.31,
            "mint": 0.08,
            "lime": 0.06,
            "blue": 0.13,
        },
        prompt=(
            "Login page background. Darker and more subtle than the main hero. "
            "Deep blue glass environment with faint glowing green edges, restrained "
            "aurora haze, soft contrast, premium low-light mood, empty composition."
        ),
    ),
    AssetSpec(
        category="tools",
        filename="resume-analyzer.png",
        aspect_ratio="1:1",
        target_size=(1024, 1024),
        image_size="1K",
        brightness_target=0.43,
        saturation_target=0.38,
        coverage_target={
            "navy_1": 0.22,
            "navy_2": 0.18,
            "mint": 0.30,
            "lime": 0.12,
            "blue": 0.18,
        },
        prompt=(
            "Floating tool icon. A 3D glass document sheet with glowing mint-green "
            "scanning lines moving across the surface, polished transparent edges, "
            "centered object, dark navy studio backdrop."
        ),
    ),
    AssetSpec(
        category="tools",
        filename="job-matcher.png",
        aspect_ratio="1:1",
        target_size=(1024, 1024),
        image_size="1K",
        brightness_target=0.45,
        saturation_target=0.40,
        coverage_target={
            "navy_1": 0.18,
            "navy_2": 0.16,
            "mint": 0.10,
            "lime": 0.24,
            "blue": 0.32,
        },
        prompt=(
            "Floating tool icon. Two puzzle pieces made from polished glass hovering "
            "near each other, one electric blue and one lime green, glowing softly "
            "from within, centered on a dark navy background."
        ),
    ),
    AssetSpec(
        category="tools",
        filename="cover-letter-final-1.png",
        aspect_ratio="1:1",
        target_size=(1024, 1024),
        image_size="1K",
        brightness_target=0.44,
        saturation_target=0.36,
        coverage_target={
            "navy_1": 0.20,
            "navy_2": 0.18,
            "mint": 0.19,
            "lime": 0.11,
            "blue": 0.32,
        },
        prompt=(
            "Floating tool icon. A sleek 3D quill pen resting on a translucent glass "
            "paper tablet, subtle mint and blue internal glow, refined premium object, "
            "centered composition, dark navy studio backdrop."
        ),
    ),
    AssetSpec(
        category="tools",
        filename="interview-prep.png",
        aspect_ratio="1:1",
        target_size=(1024, 1024),
        image_size="1K",
        brightness_target=0.45,
        saturation_target=0.37,
        coverage_target={
            "navy_1": 0.22,
            "navy_2": 0.18,
            "mint": 0.23,
            "lime": 0.10,
            "blue": 0.27,
        },
        prompt=(
            "Floating tool icon. A stylized 3D microphone merged with a speech bubble "
            "in frosted glass, internal mint and blue glow, bold but minimal form, "
            "centered on a deep navy background."
        ),
    ),
    AssetSpec(
        category="tools",
        filename="career-coach.png",
        aspect_ratio="1:1",
        target_size=(1024, 1024),
        image_size="1K",
        brightness_target=0.44,
        saturation_target=0.38,
        coverage_target={
            "navy_1": 0.21,
            "navy_2": 0.17,
            "mint": 0.14,
            "lime": 0.11,
            "blue": 0.37,
        },
        prompt=(
            "Floating tool icon. A glowing blue glass compass or futuristic path marker, "
            "clean premium geometry, softly illuminated edges, centered composition, "
            "dark navy studio background."
        ),
    ),
    AssetSpec(
        category="scenes",
        filename="workbench-overview.png",
        aspect_ratio="16:9",
        target_size=(1920, 1080),
        image_size="2K",
        brightness_target=0.33,
        saturation_target=0.34,
        coverage_target={
            "navy_1": 0.31,
            "navy_2": 0.24,
            "mint": 0.13,
            "lime": 0.10,
            "blue": 0.22,
        },
        prompt=(
            "Isometric 3D scene of an abstract workbench interface. Glass documents, "
            "charts, panels, and data tiles floating above a dark glass desk. "
            "Organized, productive, elegant composition with aurora reflections and "
            "clean negative space."
        ),
    ),
    AssetSpec(
        category="scenes",
        filename="success-moment.png",
        aspect_ratio="16:9",
        target_size=(1920, 1080),
        image_size="2K",
        brightness_target=0.52,
        saturation_target=0.45,
        coverage_target={
            "navy_1": 0.17,
            "navy_2": 0.14,
            "mint": 0.28,
            "lime": 0.27,
            "blue": 0.14,
        },
        prompt=(
            "Bright uplifting abstract success scene. A rising arrow or starburst "
            "formed from frosted glass and aurora light, bursting with lime and mint "
            "energy, optimistic premium SaaS victory moment, cinematic depth."
        ),
    ),
    AssetSpec(
        category="carousel",
        filename="dashboard-mockup-3d.png",
        aspect_ratio="16:9",
        target_size=(1920, 1080),
        image_size="2K",
        brightness_target=0.37,
        saturation_target=0.38,
        coverage_target={
            "navy_1": 0.28,
            "navy_2": 0.24,
            "mint": 0.12,
            "lime": 0.08,
            "blue": 0.28,
        },
        prompt=(
            "High-fidelity 3D render of a futuristic dashboard interface floating in "
            "space like a transparent glass HUD. Luminous graphs, cards, and data points "
            "using the brand palette, layered depth, premium polished presentation, "
            "no readable text."
        ),
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.environ.get("VERTEX_PROJECT_ID"))
    parser.add_argument("--location", default=LOCATION)
    parser.add_argument("--model", default=None)
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=2.0,
        help="Pause between API calls to avoid bursty quota errors.",
    )
    return parser.parse_args()


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def detect_project(explicit_project: str | None) -> str:
    if explicit_project:
        return explicit_project

    for key in ("VERTEX_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"):
        value = os.environ.get(key, "").strip()
        if value:
            return value

    gcloud_project = run(["gcloud", "config", "get-value", "project"])
    if gcloud_project and gcloud_project != "(unset)":
        return gcloud_project

    raise RuntimeError(
        "Could not determine a Google Cloud project. "
        "Set VERTEX_PROJECT_ID or pass --project."
    )


def ensure_directories() -> None:
    for category in ("branding", "tools", "scenes", "carousel"):
        (PICS_DIR / category).mkdir(parents=True, exist_ok=True)

    VARIANTS_DIR.mkdir(parents=True, exist_ok=True)


def build_client(project: str, location: str) -> genai.Client:
    return genai.Client(vertexai=True, project=project, location=location)


def generate_candidates(
    client: genai.Client,
    spec: AssetSpec,
    model: str,
) -> list[bytes]:
    prompt = f"{SHARED_STYLE} {spec.prompt}"
    config = types.GenerateImagesConfig(
        number_of_images=4,
        aspect_ratio=spec.aspect_ratio,
        image_size=spec.image_size,
        output_mime_type="image/png",
        negative_prompt=NEGATIVE_PROMPT,
        person_generation=types.PersonGeneration.DONT_ALLOW,
        safety_filter_level=types.SafetyFilterLevel.BLOCK_ONLY_HIGH,
        enhance_prompt=True,
    )
    response = client.models.generate_images(model=model, prompt=prompt, config=config)
    candidates = [
        item.image.image_bytes
        for item in response.generated_images or []
        if item.image and item.image.image_bytes
    ]
    if len(candidates) != 4:
        raise RuntimeError(
            f"Expected 4 images for {spec.filename}, received {len(candidates)}"
        )
    return candidates


def fit_image(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(
        image.convert("RGBA"),
        size,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def load_pixels(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    thumb = ImageOps.fit(image, (192, 192), method=Image.Resampling.BILINEAR)
    return np.asarray(thumb, dtype=np.float32) / 255.0


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    maxc = rgb.max(axis=-1)
    minc = rgb.min(axis=-1)
    delta = maxc - minc

    hue = np.zeros_like(maxc)
    saturation = np.where(maxc == 0, 0, delta / np.maximum(maxc, 1e-6))
    value = maxc

    non_zero = delta > 1e-6
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]

    mask = non_zero & (maxc == r)
    hue[mask] = ((g - b)[mask] / delta[mask]) % 6

    mask = non_zero & (maxc == g)
    hue[mask] = ((b - r)[mask] / delta[mask]) + 2

    mask = non_zero & (maxc == b)
    hue[mask] = ((r - g)[mask] / delta[mask]) + 4

    hue = hue / 6.0
    return np.stack([hue, saturation, value], axis=-1)


def evaluate_candidate(path: Path, spec: AssetSpec) -> dict[str, float]:
    pixels = load_pixels(path).reshape(-1, 3)
    hsv = rgb_to_hsv(pixels)

    distances = {
        key: np.linalg.norm(pixels - color, axis=1)
        for key, color in PALETTE.items()
    }
    distance_stack = np.stack([distances[key] for key in PALETTE], axis=1)
    closest_indices = np.argmin(distance_stack, axis=1)
    closest_distance = np.min(distance_stack, axis=1)

    keys = list(PALETTE.keys())
    coverage = {
        key: float(
            np.mean((closest_indices == index) & (closest_distance < 0.26))
        )
        for index, key in enumerate(keys)
    }
    coverage_total = sum(coverage.values()) or 1.0
    normalized_coverage = {
        key: coverage[key] / coverage_total for key in coverage
    }

    closeness = {
        key: float(np.exp(-((distances[key] / 0.24) ** 2)).mean())
        for key in PALETTE
    }

    brightness = float(
        (
            0.2126 * pixels[:, 0]
            + 0.7152 * pixels[:, 1]
            + 0.0722 * pixels[:, 2]
        ).mean()
    )
    saturation = float(hsv[:, 1].mean())
    contrast = float(np.std(hsv[:, 2]))

    target = spec.coverage_target
    mix_gap = sum(abs(normalized_coverage[key] - target[key]) for key in target) / 2.0
    coverage_alignment = max(0.0, 1.0 - mix_gap)

    accent_presence = sum(coverage[key] for key in ACCENT_KEYS)
    accent_target = sum(target[key] for key in ACCENT_KEYS)
    accent_alignment = max(0.0, 1.0 - abs(accent_presence - accent_target) / 0.45)

    navy_presence = sum(coverage[key] for key in BACKGROUND_KEYS)
    navy_target = sum(target[key] for key in BACKGROUND_KEYS)
    navy_alignment = max(0.0, 1.0 - abs(navy_presence - navy_target) / 0.45)

    brightness_alignment = max(
        0.0, 1.0 - abs(brightness - spec.brightness_target) / 0.40
    )
    saturation_alignment = max(
        0.0, 1.0 - abs(saturation - spec.saturation_target) / 0.40
    )

    palette_match = sum(closeness.values()) / len(closeness)
    score = (
        palette_match * 2.4
        + coverage_alignment * 2.0
        + accent_alignment * 1.3
        + navy_alignment * 0.9
        + brightness_alignment * 1.1
        + saturation_alignment * 0.9
        + min(contrast / 0.25, 1.0) * 0.7
    )

    return {
        "score": round(float(score), 5),
        "palette_match": round(float(palette_match), 5),
        "coverage_alignment": round(float(coverage_alignment), 5),
        "accent_alignment": round(float(accent_alignment), 5),
        "navy_alignment": round(float(navy_alignment), 5),
        "brightness_alignment": round(float(brightness_alignment), 5),
        "saturation_alignment": round(float(saturation_alignment), 5),
        "brightness": round(float(brightness), 5),
        "saturation": round(float(saturation), 5),
        "contrast": round(float(contrast), 5),
        "coverage": {key: round(float(value), 5) for key, value in coverage.items()},
        "normalized_coverage": {
            key: round(float(value), 5) for key, value in normalized_coverage.items()
        },
    }


def save_variant(bytes_data: bytes, output_path: Path, size: tuple[int, int]) -> None:
    image = Image.open(io_from_bytes(bytes_data))
    fitted = fit_image(image, size)
    fitted.save(output_path, format="PNG")


def io_from_bytes(data: bytes) -> Any:
    from io import BytesIO

    return BytesIO(data)


def maybe_generate_with_fallback(
    client: genai.Client,
    spec: AssetSpec,
    explicit_model: str | None,
) -> tuple[str, list[bytes]]:
    model_errors: list[str] = []
    candidates = [explicit_model] if explicit_model else []
    candidates.extend(candidate for candidate in MODEL_CANDIDATES if candidate)

    seen: set[str] = set()
    ordered_models = [m for m in candidates if not (m in seen or seen.add(m))]

    for model in ordered_models:
        try:
            return model, generate_candidates(client, spec, model)
        except Exception as exc:  # pragma: no cover - exercised by live API runs
            model_errors.append(f"{model}: {exc}")

    raise RuntimeError(
        f"Failed to generate {spec.filename} with available models: "
        + " | ".join(model_errors)
    )


def process_asset(
    client: genai.Client,
    spec: AssetSpec,
    explicit_model: str | None,
) -> dict[str, Any]:
    print(f"\nGenerating {spec.category}/{spec.filename}...")
    spec.variant_dir.mkdir(parents=True, exist_ok=True)
    spec.output_path.parent.mkdir(parents=True, exist_ok=True)

    model_used, candidates = maybe_generate_with_fallback(client, spec, explicit_model)

    scored_candidates: list[dict[str, Any]] = []
    for index, candidate_bytes in enumerate(candidates, start=1):
        variant_path = spec.variant_dir / f"variant-{index}.png"
        save_variant(candidate_bytes, variant_path, spec.target_size)
        metrics = evaluate_candidate(variant_path, spec)
        scored_candidates.append(
            {
                "variant": index,
                "path": str(variant_path.relative_to(ROOT)),
                **metrics,
            }
        )
        print(f"  candidate {index}: score={metrics['score']:.4f}")

    best_candidate = max(scored_candidates, key=lambda item: item["score"])
    selected_variant_path = ROOT / best_candidate["path"]
    final_image = Image.open(selected_variant_path).convert("RGBA")
    final_image.save(spec.output_path, format="PNG")
    print(
        "  selected "
        f"variant {best_candidate['variant']} -> {spec.output_path.relative_to(ROOT)}"
    )

    return {
        "category": spec.category,
        "filename": spec.filename,
        "output_path": str(spec.output_path.relative_to(ROOT)),
        "model": model_used,
        "aspect_ratio": spec.aspect_ratio,
        "image_size": spec.image_size,
        "target_size": list(spec.target_size),
        "prompt": f"{SHARED_STYLE} {spec.prompt}",
        "coverage_target": spec.coverage_target,
        "selected_variant": best_candidate["variant"],
        "selected_score": best_candidate["score"],
        "variants": scored_candidates,
    }


def write_manifest(project: str, location: str, assets: list[dict[str, Any]]) -> None:
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": project,
        "location": location,
        "asset_count": len(assets),
        "assets": assets,
    }
    manifest_path = PICS_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    project = detect_project(args.project)
    location = args.location

    ensure_directories()
    client = build_client(project, location)

    results: list[dict[str, Any]] = []
    for index, spec in enumerate(ASSETS):
        results.append(process_asset(client, spec, args.model))
        if index < len(ASSETS) - 1 and args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    write_manifest(project, location, results)
    print(
        f"\nFinished. Saved {len(results)} final assets under "
        f"{PICS_DIR.relative_to(ROOT)}."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        raise SystemExit(130)
