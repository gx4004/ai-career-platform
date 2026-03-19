#!/usr/bin/env python3
"""Regenerate the 3 carousel images that had too much empty background."""

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "carousel"

STYLE = (
    "Ultra-realistic product UI screenshot. Flat orthographic view, no perspective, no 3D tilt, no rotation. "
    "Content fills the ENTIRE frame edge-to-edge with ZERO margins, ZERO empty background, ZERO padding around the UI. "
    "The UI elements touch all four edges of the image. "
    "Looks exactly like a cropped browser screenshot of a polished SaaS application. "
    "Blue (#1d6cb5) accent color, white background, clean sans-serif typography. "
    "Dense layout with realistic data. Sharp, high resolution. NO floating cards on colored backgrounds."
)

IMAGES = {
    "carousel-cover-letter-final-1.png": (
        f"{STYLE} "
        "A cover letter document editor that fills the ENTIRE image with no margins. "
        "The white document content starts at the very top edge and extends to the very bottom edge. "
        "At the top: a thin blue toolbar with formatting icons spanning full width. "
        "Below: large bold heading Dear Hiring Manager. "
        "Then 3 long paragraphs of realistic cover letter body text in dark gray. "
        "Some key phrases have a light blue highlight background. "
        "At the bottom: Sincerely followed by a name. "
        "The text content fills the entire image like a zoomed-in screenshot of Google Docs. "
        "White background with text, NO gray empty space around the document."
    ),
    "carousel-interview.png": (
        f"{STYLE} "
        "An interview practice interface that fills the ENTIRE image with no margins. "
        "This is a FLAT, straight-on view — no tilted cards, no perspective, no scattered elements. "
        "Top third: a solid blue banner spanning full width with white text reading "
        "Tell me about a time you led a cross-functional project and a question mark icon. "
        "Middle section: white background with a heading SUGGESTED ANSWER and 3 numbered bullet points "
        "of detailed answer text filling the width. "
        "Bottom section: a horizontal row of tag chips Behavioral, Role-specific, Technical "
        "and a green badge reading High Confidence on the right side. "
        "Everything is stacked vertically in a single flat column with no gaps between sections."
    ),
    "carousel-career.png": (
        f"{STYLE} "
        "A career roadmap dashboard that fills the ENTIRE image with no margins. "
        "White background filling the full frame. "
        "Left side: a vertical timeline line with 4 large connected nodes from bottom to top. "
        "Each node is a blue circle with a card extending to the right: "
        "Node 1 (bottom, light blue): Junior Developer — Current Role. "
        "Node 2: Mid-Level Engineer — 1-2 Years. "
        "Node 3: Senior Engineer — 2-4 Years. "
        "Node 4 (top, dark blue): Tech Lead — Target Role. "
        "Right side: a panel with a 3-5 Years timeline badge and skill gap tags. "
        "The layout fills the entire image like a zoomed-in dashboard screenshot. "
        "White background, NO gradient, NO empty colored backgrounds."
    ),
}

DELAY_BETWEEN_CALLS = 12
MAX_RETRIES = 4
RETRY_BACKOFF = 25


def main():
    client = genai.Client(vertexai=True, project="project-4c5fe2fe-dadd-4b3e-bd2", location="us-central1")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    items = list(IMAGES.items())
    for idx, (filename, prompt) in enumerate(items):
        out_path = OUT_DIR / filename
        print(f"\n[{idx + 1}/{len(items)}] Regenerating {filename}...")

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

        if idx < len(items) - 1:
            print(f"  .. Waiting {DELAY_BETWEEN_CALLS}s before next image...")
            time.sleep(DELAY_BETWEEN_CALLS)

    print("\nDone!")


if __name__ == "__main__":
    main()
