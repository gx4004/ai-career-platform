#!/usr/bin/env python3
"""Generate 5 showcase thumbnails for the dashboard tool cards using Imagen 3 via Vertex AI."""

import sys
from pathlib import Path

from google import genai
from google.genai import types

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "carousel"

# Shared style direction for visual consistency
STYLE = (
    "Clean, minimal, modern UI dashboard mockup illustration on a soft light-blue/white gradient background. "
    "Flat design with subtle shadows, rounded corners, no real text — use placeholder lines for text. "
    "Soft blue (#1d6cb5) accent color palette with white cards. No people, no hands. "
    "Professional SaaS product screenshot aesthetic. High quality, sharp, 3D-ish depth with glass morphism touches."
)

THUMBS = {
    "thumb-job-match.png": (
        f"{STYLE} "
        "Show a dashboard card comparing a resume to a job posting. Left side shows a document icon with "
        "skill tags (colored pills in green/blue). Right side shows a circular match percentage gauge at ~91% "
        "in blue. Below: a two-column grid of matched skills (green checkmarks) and missing skills (orange triangles). "
        "Clean data visualization feel."
    ),
    "thumb-cover-letter-final-1.png": (
        f"{STYLE} "
        "Show an elegant cover letter document floating on the background. The letter has a clean header area, "
        "paragraph placeholder lines with a few highlighted/blue-accented phrases. A small AI sparkle icon in the "
        "top corner suggests AI generation. Subtle paper shadow. Feels like a polished document editor preview."
    ),
    "thumb-interview.png": (
        f"{STYLE} "
        "Show an interview preparation card with a chat-bubble style Q&A layout. Top: a question bubble in "
        "blue/purple with a search icon. Below: an answer area with bullet points and placeholder lines. "
        "A small confidence badge showing 'High' in green at the bottom. Feels like a structured flashcard deck."
    ),
    "thumb-career.png": (
        f"{STYLE} "
        "Show a vertical career roadmap/timeline visualization. A vertical line with 4 connected nodes/dots "
        "progressing upward, each with a label area next to it (Entry, Growth, Leadership, Executive). "
        "Nodes colored in gradient from light blue to deep blue. A small clock/timeline badge at the bottom. "
        "Feels like a progression tracker."
    ),
    "thumb-portfolio.png": (
        f"{STYLE} "
        "Show a portfolio planner dashboard with a 2x2 grid of project cards, each with a colored accent "
        "bar at the top (blue, green, purple, teal) and placeholder content lines below. A score badge "
        "showing '78' in the top-right corner. Feels like a Kanban-style project overview board."
    ),
}


def main():
    client = genai.Client(vertexai=True, project="project-4c5fe2fe-dadd-4b3e-bd2", location="us-central1")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, prompt in THUMBS.items():
        out_path = OUT_DIR / filename
        print(f"Generating {filename}...")
        try:
            response = client.models.generate_images(
                model="imagen-3.0-generate-002",
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio="16:9",
                ),
            )
            if not response.generated_images:
                print(f"  !! No images returned", file=sys.stderr)
                continue

            image_bytes = response.generated_images[0].image.image_bytes
            out_path.write_bytes(image_bytes)
            print(f"  -> Saved {out_path.name} ({len(image_bytes) // 1024}KB)")
        except Exception as e:
            print(f"  !! Failed: {e}", file=sys.stderr)

    print("\nDone!")


if __name__ == "__main__":
    main()
