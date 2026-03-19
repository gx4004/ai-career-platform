#!/usr/bin/env python3
"""Regenerate cover letter carousel image with stronger frame-filling prompt."""

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "carousel"

PROMPT = (
    "A screenshot of a web-based text editor application, captured directly from a browser. "
    "The screenshot fills the entire image with no borders or padding. "
    "At the very top: a thin toolbar with formatting buttons (Bold, Italic, Underline, font size dropdown). "
    "Below the toolbar: white document area filling the rest of the image. "
    "The document contains a professional cover letter with: "
    "- A bold heading: Dear Hiring Manager "
    "- Three paragraphs of body text in dark gray, with some phrases highlighted in light blue "
    "- The letter ends with: Sincerely, followed by a name "
    "The white document area extends to all edges of the image. "
    "Clean, modern, sans-serif font. Blue (#1d6cb5) accents. "
    "This looks like a real cropped screenshot of Google Docs or Notion. "
    "Ultra high resolution, sharp text, professional SaaS application."
)

MAX_RETRIES = 4
RETRY_BACKOFF = 25


def main():
    client = genai.Client(vertexai=True, project="project-4c5fe2fe-dadd-4b3e-bd2", location="us-central1")

    filename = "carousel-cover-letter-final-1.png"
    out_path = OUT_DIR / filename
    print(f"Regenerating {filename}...")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.generate_images(
                model="imagen-3.0-generate-002",
                prompt=PROMPT,
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
                time.sleep(RETRY_BACKOFF)

    print("Done!")


if __name__ == "__main__":
    main()
