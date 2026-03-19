"""
Batch-generate dashboard tool card images via Vertex AI Imagen.
Generates multiple variants per tool with professional LinkedIn/Facebook style.
"""

import os
import asyncio
from pathlib import Path
from google import genai

PROJECT_ID = "project-4c5fe2fe-dadd-4b3e-bd2"
LOCATION = "us-central1"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "temp" / "generated-tool-cards"

client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


TOOL_PROMPTS: dict[str, list[str]] = {
    "job-match": [
        # v1 - clean corporate
        "Professional clean illustration for a job matching tool card. Shows a stylized resume document connecting to a job listing with a match percentage badge. Modern flat design, soft blue and white corporate color palette, subtle gradients, LinkedIn-style professional aesthetic. Clean white background fading to light blue. No text, no words, no letters.",
        # v2 - puzzle
        "Minimalist professional illustration of two puzzle pieces fitting together, one representing a candidate profile and one a job role. Soft blue tones, clean lines, modern corporate SaaS style similar to LinkedIn or Indeed design language. Subtle depth with light shadows. No text, no words, no letters.",
        # v3 - target
        "Clean modern illustration of a bullseye target with a resume arrow hitting center. Professional blue and white color scheme, soft gradients, minimal corporate design. Feels like a premium SaaS product card. Light background. No text, no words, no letters.",
        # v4 - venn diagram
        "Sleek professional illustration showing overlapping circles (Venn diagram) representing skills overlap between a candidate and job requirements. Soft blue and teal gradients, clean modern design, LinkedIn aesthetic. Light clean background. No text, no words, no letters.",
        # v5 - handshake
        "Modern minimalist illustration of a professional digital handshake concept, representing job-candidate matching. Clean blue corporate palette, subtle glassmorphism effects, premium SaaS design. Light background. No text, no words, no letters.",
    ],
    "cover-letter": [
        # v1 - letter with pen
        "Professional clean illustration for a cover letter generator tool. Shows a stylized document with a fountain pen and subtle AI sparkles. Modern flat design, soft blue and white corporate palette, LinkedIn-style aesthetic. Clean light background. No text, no words, no letters.",
        # v2 - paper airplane
        "Minimalist professional illustration of an elegant paper airplane made from a letter/document, symbolizing sending a cover letter. Soft blue tones, clean modern corporate design, premium feel. Light background. No text, no words, no letters.",
        # v3 - typewriter modern
        "Clean modern illustration blending a classic typewriter silhouette with digital/AI elements like subtle particle effects. Professional blue and white palette, SaaS product card style. Light background. No text, no words, no letters.",
        # v4 - envelope
        "Sleek professional illustration of a premium envelope with a glowing document emerging from it, representing a polished cover letter. Soft blue gradients, modern corporate aesthetic, clean design. Light background. No text, no words, no letters.",
        # v5 - quill digital
        "Modern minimalist illustration of a digital quill writing on a floating document, with subtle AI-generated sparkle effects. Clean blue corporate palette, premium SaaS design. Light background. No text, no words, no letters.",
    ],
    "interview": [
        # v1 - chat bubbles
        "Professional clean illustration for an interview prep tool. Shows stylized conversation bubbles in a professional setting, one with a question mark and one with a checkmark. Modern flat design, soft blue and white corporate palette. Light background. No text, no words, no letters.",
        # v2 - video call
        "Minimalist professional illustration of a video call interface frame with two professional silhouettes, representing a mock interview. Soft blue tones, clean modern corporate design, LinkedIn aesthetic. Light background. No text, no words, no letters.",
        # v3 - microphone
        "Clean modern illustration of a professional microphone with subtle soundwave visualization, representing interview practice. Professional blue and white palette, premium SaaS card style. Light background. No text, no words, no letters.",
        # v4 - confidence meter
        "Sleek professional illustration showing a person silhouette with a rising confidence meter/chart, representing interview preparation. Soft blue gradients, modern corporate aesthetic. Light background. No text, no words, no letters.",
        # v5 - podium
        "Modern minimalist illustration of a presentation podium with subtle spotlight effect, representing interview readiness. Clean blue corporate palette, premium professional design. Light background. No text, no words, no letters.",
    ],
    "career": [
        # v1 - roadmap
        "Professional clean illustration for a career planning tool. Shows a stylized winding road/path going upward with milestone markers. Modern flat design, soft blue and white corporate palette, LinkedIn-style aesthetic. Light background. No text, no words, no letters.",
        # v2 - compass
        "Minimalist professional illustration of a modern compass with career direction arrows, representing career guidance. Soft blue tones, clean modern corporate design, premium feel. Light background. No text, no words, no letters.",
        # v3 - staircase
        "Clean modern illustration of ascending steps/staircase with a flag at the top, representing career growth trajectory. Professional blue and white palette, SaaS product card style. Light background. No text, no words, no letters.",
        # v4 - telescope
        "Sleek professional illustration of a telescope looking toward a bright horizon with subtle chart elements, representing career vision. Soft blue gradients, modern corporate aesthetic. Light background. No text, no words, no letters.",
        # v5 - branching paths
        "Modern minimalist illustration of branching paths diverging from a single point, representing career options and planning. Clean blue corporate palette, premium SaaS design. Light background. No text, no words, no letters.",
    ],
    "portfolio": [
        # v1 - showcase grid
        "Professional clean illustration for a portfolio builder tool. Shows a stylized grid of project cards arranged in a showcase layout. Modern flat design, soft blue and white corporate palette, LinkedIn-style aesthetic. Light background. No text, no words, no letters.",
        # v2 - gallery
        "Minimalist professional illustration of a curated gallery wall with framed project thumbnails, representing a professional portfolio. Soft blue tones, clean modern corporate design. Light background. No text, no words, no letters.",
        # v3 - briefcase modern
        "Clean modern illustration of a sleek digital briefcase opening to reveal project gems/diamonds inside, representing portfolio value. Professional blue and white palette, premium feel. Light background. No text, no words, no letters.",
        # v4 - layers
        "Sleek professional illustration of stacked transparent layers/cards fanning out, each representing a portfolio piece. Soft blue gradients, modern corporate aesthetic, glassmorphism hints. Light background. No text, no words, no letters.",
        # v5 - rocket
        "Modern minimalist illustration of a small rocket launching from a portfolio document, representing career acceleration through projects. Clean blue corporate palette, premium SaaS design. Light background. No text, no words, no letters.",
    ],
}


async def generate_one(tool: str, variant: int, prompt: str) -> str | None:
    filename = f"{tool}_v{variant}.png"
    filepath = OUTPUT_DIR / filename
    if filepath.exists():
        print(f"  [skip] {filename} already exists")
        return str(filepath)

    try:
        response = client.models.generate_images(
            model="imagen-3.0-generate-002",
            prompt=prompt,
            config=genai.types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="16:9",
            ),
        )
        if not response.generated_images:
            print(f"  [fail] {filename}: no images returned")
            return None

        image_bytes = response.generated_images[0].image.image_bytes
        filepath.write_bytes(image_bytes)
        print(f"  [done] {filename} ({len(image_bytes) // 1024}KB)")
        return str(filepath)
    except Exception as e:
        print(f"  [error] {filename}: {e}")
        return None


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total = sum(len(v) for v in TOOL_PROMPTS.values())
    print(f"Generating {total} images across {len(TOOL_PROMPTS)} tools...\n")

    for tool, prompts in TOOL_PROMPTS.items():
        print(f"--- {tool} ---")
        for i, prompt in enumerate(prompts, start=1):
            await generate_one(tool, i, prompt)
            await asyncio.sleep(20)  # rate limit: ~3 req/min
        print()

    generated = list(OUTPUT_DIR.glob("*.png"))
    print(f"\nDone! {len(generated)} images in {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
