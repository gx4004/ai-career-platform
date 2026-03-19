#!/usr/bin/env python3
"""Regenerate all 6 carousel-*.png images using Imagen 3 via Vertex AI.

Usage:
    python scripts/gen_carousel.py
"""

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "carousel"

STYLE = (
    "Ultra-realistic product UI screenshot. Flat orthographic view, no perspective, no 3D tilt. "
    "Fills the entire frame edge-to-edge with zero margins or empty background. "
    "Looks exactly like a real browser screenshot of a polished SaaS application. "
    "Blue (#1d6cb5) accent color, white/light gray background, clean sans-serif typography. "
    "Dense layout with realistic data, no placeholder scribbles. Sharp, high resolution."
)

IMAGES = {
    "carousel-resume.png": (
        f"{STYLE} "
        "A full-screen resume analysis dashboard filling the entire image. "
        "Large circular score ring showing the number 84 out of 100 at top center, blue ring on white. "
        "Below it, 4 horizontal progress bars stacked vertically, each labeled: "
        "Skills Match 85%, Experience 80%, Education 75%, Keywords 70%. Bars are filled in blue. "
        "Bottom section: a row of rounded pill-shaped tags reading TypeScript, React, FastAPI, Python, Docker. "
        "White background, blue accents throughout. Looks like a real analytics dashboard screenshot, "
        "densely packed with data, filling every pixel of the frame."
    ),
    "carousel-job-match.png": (
        f"{STYLE} "
        "A job match results screen filling the entire image edge-to-edge. "
        "Left half: a large donut chart showing 91 percent in big bold text in the center, "
        "with the ring mostly filled in blue. "
        "Right half: two stacked metric cards — top card says Matched Skills 8 out of 10 with a green checkmark, "
        "bottom card says Gaps to Close 2 with an orange warning icon. "
        "Below: two status pills with checkmarks reading Communication and Leadership. "
        "Tight composition, no empty space. Looks like a real comparison dashboard."
    ),
    "carousel-cover-letter-final-1.png": (
        f"{STYLE} "
        "A document editor showing a cover letter filling the entire frame edge-to-edge. "
        "Thin blue header bar at top with document title. "
        "Body text starting with Dear Hiring Manager in bold. "
        "Three dense paragraph blocks of realistic cover letter text. "
        "A few key phrases highlighted with light blue background. "
        "Closing with Sincerely and a name at the bottom. "
        "Looks exactly like Google Docs or Notion — a real text editor with toolbar icons at top. "
        "Fills entire frame, no floating card effect."
    ),
    "carousel-interview.png": (
        f"{STYLE} "
        "An interview practice interface filling the entire frame. "
        "Top section: a blue card with a question mark icon and the text "
        "Tell me about a time you led a cross-functional project. "
        "Center section: a structured answer card with 3 numbered bullet points of realistic answer text. "
        "Bottom section: a row of tag chips reading Behavioral, Role-specific, Technical. "
        "A small green badge reading High Confidence in the bottom right. "
        "Vertical stack of cards filling the frame completely. Flashcard deck aesthetic."
    ),
    "carousel-career.png": (
        f"{STYLE} "
        "A career roadmap visualization filling the entire frame. "
        "A vertical timeline with 4 connected circular nodes from bottom to top. "
        "Each node has a card beside it: "
        "Bottom node (lightest blue): Junior Developer with subtitle Current Role. "
        "Second node: Mid-Level Engineer with subtitle 1-2 Years. "
        "Third node: Senior Engineer with subtitle 2-4 Years. "
        "Top node (darkest blue): Tech Lead with subtitle Target Role. "
        "A badge reading 3-5 Years timeline near the top. "
        "Nodes connected by a vertical blue line, gradient from light to dark blue. "
        "Infographic poster style filling every pixel."
    ),
    "carousel-portfolio.png": (
        f"{STYLE} "
        "A project management dashboard filling the entire frame edge-to-edge. "
        "A 2x2 grid of project cards with no gaps. "
        "Top-left card: blue accent bar, title REST API Server, progress bar at 60 percent, 2 lines of detail. "
        "Top-right card: green accent bar, title React Dashboard, progress bar at 45 percent, 2 lines of detail. "
        "Bottom-left card: purple accent bar, title ML Pipeline, progress bar at 30 percent, 2 lines of detail. "
        "Bottom-right card: teal accent bar, title Mobile App, progress bar at 75 percent, 2 lines of detail. "
        "A circular score badge showing 78 in the top right corner of the screen. "
        "Dense Kanban-style board, no margins, looks like a real project management tool."
    ),
}

DELAY_BETWEEN_CALLS = 12  # seconds
MAX_RETRIES = 4
RETRY_BACKOFF = 25  # seconds


def main():
    client = genai.Client(vertexai=True, project="project-4c5fe2fe-dadd-4b3e-bd2", location="us-central1")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    items = list(IMAGES.items())
    for idx, (filename, prompt) in enumerate(items):
        out_path = OUT_DIR / filename
        print(f"\n[{idx + 1}/{len(items)}] Generating {filename}...")

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = client.models.generate_images(
                    model="imagen-3.0-generate-002",
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio="1:1",
                    ),
                )
                if not response.generated_images:
                    print(f"  !! No images returned (attempt {attempt})", file=sys.stderr)
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_BACKOFF)
                    continue

                image_bytes = response.generated_images[0].image.image_bytes
                out_path.write_bytes(image_bytes)
                print(f"  -> Saved {filename} ({len(image_bytes) // 1024}KB)")
                break
            except Exception as e:
                print(f"  !! Attempt {attempt} failed: {e}", file=sys.stderr)
                if attempt < MAX_RETRIES:
                    print(f"  .. Retrying in {RETRY_BACKOFF}s...")
                    time.sleep(RETRY_BACKOFF)
                else:
                    print(f"  !! All {MAX_RETRIES} attempts failed for {filename}", file=sys.stderr)

        # Delay between images to avoid rate limiting
        if idx < len(items) - 1:
            print(f"  .. Waiting {DELAY_BETWEEN_CALLS}s before next image...")
            time.sleep(DELAY_BETWEEN_CALLS)

    print("\nDone! Generated images are in:", OUT_DIR)


if __name__ == "__main__":
    main()
