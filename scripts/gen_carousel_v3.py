#!/usr/bin/env python3
"""Regenerate carousel-*.png images using Imagen 3 via Vertex AI.

v4: Refined prompts from v3. Interview card simplified to avoid garbled text.
    Cover letter changed from phone to floating document card.
    All 6 regenerated for visual consistency.

Usage:
    python3 scripts/gen_carousel_v3.py
"""

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "carousel"

STYLE = (
    "A 3D rendered floating UI card photographed at a slight angle with shallow depth of field. "
    "Soft studio lighting, subtle shadow beneath the card, clean white/light gray background with gentle gradient. "
    "The card has rounded corners, a soft drop shadow, and a modern glassmorphism feel. "
    "Blue (#1d6cb5) accent color, white card surface, clean sans-serif font. "
    "The card floats in space like a product mockup. Sharp 4K render. "
    "All text on the card must be perfectly spelled, crisp, and legible. "
    "The card fills at least 80 percent of the frame. Tight crop, minimal empty background."
)

IMAGES = {
    "carousel-resume.png": (
        f"{STYLE} "
        "A floating resume analysis card. "
        "Left side: a large circular progress ring in blue showing the number 84 in bold inside. "
        "Right side: 4 horizontal progress bars stacked vertically, no text labels, "
        "just gray placeholder lines next to each bar. "
        "Bars filled in blue on light gray tracks. "
        "Bottom: 3 rounded pill tags with short placeholder gray lines inside."
    ),
    "carousel-job-match.png": (
        f"{STYLE} "
        "A floating job match results card. "
        "Center: a large donut chart ring in blue showing 91% in bold inside the ring. "
        "Right side: two stacked mini-cards with simple icons, no readable text labels. "
        "Top mini-card with a green checkmark icon. "
        "Bottom mini-card with an orange warning icon. "
        "Clean and minimal, no specific text."
    ),
    "carousel-cover-letter-final-1.png": (
        f"{STYLE} "
        "A floating white rectangular document card, like a sheet of paper hovering in space. "
        "Top of the card: bold heading text Dear Hiring Manager in dark serif font. "
        "Below: three short paragraphs represented by neat dark gray text lines, "
        "with a few key phrases highlighted in light blue. "
        "The paragraphs look like real letter text with clear line spacing. "
        "Bottom of the card: the word Sincerely in bold italic, then Alex Chen below it. "
        "A thin blue accent line at the very top edge of the card. "
        "No toolbar, no phone frame — just a clean floating letter document."
    ),
    "carousel-interview.png": (
        f"{STYLE} "
        "A floating interview prep card. "
        "Top section: a blue rounded banner area with a large white question mark icon in the center. "
        "Below the icon, small white text: Practice Question. "
        "Middle section on white background: three numbered lines in dark text: "
        "1. Situation, 2. Action, 3. Result. "
        "Each line has a small circle bullet. "
        "Bottom: three rounded pill tags side by side: Behavioral, Technical, Leadership. "
        "A small green circular badge in the top-right corner with a checkmark."
    ),
    "carousel-career.png": (
        f"{STYLE} "
        "A floating career roadmap card. "
        "A vertical timeline with a blue gradient line connecting 4 circular nodes from bottom to top. "
        "Node 1 (bottom, light blue): Junior Dev — Current. "
        "Node 2: Mid-Level — 1-2 Yrs. "
        "Node 3: Senior — 2-4 Yrs. "
        "Node 4 (top, dark blue): Tech Lead — Target. "
        "Each node has a small label card beside it. "
        "The word Growth appears near the timeline. "
        "Cards alternate sides. Blue gradient from light to dark going up."
    ),
    "carousel-portfolio.png": (
        f"{STYLE} "
        "A floating portfolio dashboard card with a 2x2 grid of project mini-cards. "
        "Top-left: blue accent bar, gray placeholder lines, progress bar at 60%. "
        "Top-right: green accent bar, gray placeholder lines, progress bar at 45%. "
        "Bottom-left: purple accent bar, gray placeholder lines, progress bar at 30%. "
        "Bottom-right: teal accent bar, gray placeholder lines, progress bar at 75%. "
        "No readable project titles, use short gray lines instead. "
        "Cards have rounded corners and thin borders."
    ),
}

DELAY_BETWEEN_CALLS = 12  # seconds
MAX_RETRIES = 4
RETRY_BACKOFF = 25  # seconds


def main():
    client = genai.Client(
        vertexai=True,
        project="project-4c5fe2fe-dadd-4b3e-bd2",
        location="us-central1",
    )
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
                    print(
                        f"  !! All {MAX_RETRIES} attempts failed for {filename}",
                        file=sys.stderr,
                    )

        # Delay between images to avoid rate limiting
        if idx < len(items) - 1:
            print(f"  .. Waiting {DELAY_BETWEEN_CALLS}s before next image...")
            time.sleep(DELAY_BETWEEN_CALLS)

    print("\nDone! Generated images are in:", OUT_DIR)


if __name__ == "__main__":
    main()
