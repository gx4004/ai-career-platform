# Carousel Reference Prompt Pack

This file replaces the old redesign-oriented prompt pack.

The goal is not to invent new compositions. The goal is to recreate the existing carousel images almost 1:1, while translating them into the current product theme so they feel closer to LinkedIn or Facebook product marketing art.

## Core Rule

Always attach the current PNG as a reference image when prompting.

Tell the model to preserve:

- the same framing
- the same panel size and placement
- the same information hierarchy
- the same number of cards, bars, chips, and text blocks
- the same approximate spacing
- the same overall composition

Tell the model to change only:

- palette
- material feel
- lighting
- border treatment
- typography mood
- background treatment

## Current Theme Tokens

Use these values as the visual source of truth:

- Background: `#EDF3FA`
- Raised surface: `#FFFFFF`
- Focus surface: `#F3F8FD`
- Subtle tint: `rgba(10, 102, 194, 0.08)`
- Text strong: `#16324B`
- Text body: `#36506B`
- Text muted: `#617B95`
- Border: `#D7E5F1`
- Strong border: `#BED4E6`
- Primary blue: `#0A66C2`
- Primary blue dark: `#0A4F98`
- Success green: `#0A8A50`
- Warning amber: `#D97706`

## Theme Translation

Translate the old images like this:

- dark star field -> pale blue-gray product canvas
- neon glow -> soft shadow and crisp 1px border
- glass card -> solid white card with subtle elevation
- sci-fi green lighting -> brand blue accents
- bright purple/orange/pink flares -> restrained blue, muted green, or muted amber accents only when needed
- cosmic atmosphere -> polished social-product marketing feel

## Master Prompt

Use this at the beginning of every prompt:

```text
Use the attached image as a strict composition reference. Recreate the same UI scene with nearly identical framing, card proportions, spacing, content structure, and visual hierarchy, but restyle it into our current product theme: light professional SaaS, LinkedIn/Facebook-like product marketing, pale blue-gray background, white cards, slate-blue text, brand blue accents, subtle borders, soft shadows, clean modern typography, polished and trustworthy. Keep the layout almost the same. Do not redesign the scene. Do not add or remove modules. Replace neon/glow/cosmic styling with crisp enterprise UI styling.
```

## Negative Prompt

Use this at the end of every prompt:

```text
do not change the composition, do not crop differently, do not add extra widgets, do not add people, do not add laptops or desks, no dark mode, no star field, no outer space, no cyberpunk, no holographic HUD, no glassmorphism, no bloom, no neon rim light, no glossy black panel, no purple glow, no orange flare, no pink flare, no heavy gradients, no game UI, no futuristic cockpit, no unreadable gibberish text, no warped perspective, no photorealism
```

## Usage Note For ChatGPT

Best results usually come from this structure:

1. Attach the original carousel PNG.
2. Paste the master prompt.
3. Paste the asset-specific prompt below.
4. Paste the negative prompt.
5. If the first result drifts too much, say:

```text
Make it closer to the reference image. Keep the exact same layout and element placement. Only change the theme and material styling.
```

## Shared Rendering Rules

- Output size: `1536x1024` for large frames
- Output size: `1024x1024` for square thumbnails
- Straight-on view
- No dramatic perspective
- Clean placeholder UI text is fine
- Real readable paragraphs are not required
- Keep strong legibility at small sizes

## Asset Prompts

### `src/assets/carousel/carousel-resume.png`

Reference structure to preserve:

- wide centered panel
- top title row
- large score ring in the upper middle
- four horizontal progress bars underneath
- three rounded skill chips at the bottom

Prompt:

```text
Same composition as the reference image: a centered wide resume analysis panel with a title at the top, one large circular score module in the upper center showing 84, four horizontal evaluation rows below it, and three rounded skill chips along the bottom. Restyle it into our current blue-and-white product theme. Use a pale blue-gray page background, a white main card, slate-blue text, blue progress bars, subtle border lines, soft card shadow, and a calm enterprise-product finish. The circular score should feel premium and clean, more like a LinkedIn product dashboard than a sci-fi interface. Keep the original proportions and layout almost exactly the same.
```

### `src/assets/carousel/carousel-job-match.png`

Reference structure to preserve:

- wide centered panel
- large percentage ring on the left
- two metric cards on the right
- two status pills across the lower area

Prompt:

```text
Same composition as the reference image: a centered wide job match comparison panel with a large percentage ring on the left showing 91 percent, two summary cards on the right, and two large status pills along the bottom row. Restyle it into our current theme with a light blue-gray background, white surfaces, blue accents, dark slate text, thin borders, and soft shadows. The match ring should feel crisp and professional, with subtle blue emphasis and optional small success-green indicators. Keep the same visual balance, spacing, and module placement as the reference. This should feel like social-network product marketing UI, not futuristic UI.
```

### `src/assets/carousel/carousel-cover-letter.png`

Reference structure to preserve:

- wide centered panel
- title row at the top
- greeting line
- left accent rail
- three compact body text blocks
- closing sign-off at the bottom

Prompt:

```text
Same composition as the reference image: a centered wide cover letter drafting panel with a top title, greeting line, a slim vertical accent rail on the left, three compact text sections in the body, and a short sign-off at the bottom. Restyle it into our current theme using a pale blue-gray canvas, white document surface, slate-blue typography, a clean brand-blue accent rail, subtle border lines, and soft elevation. Keep it editorial and product-like, similar to a polished LinkedIn or Facebook writing tool. Preserve the same framing and text-block arrangement as the reference.
```

### `src/assets/carousel/thumb-resume.png`

Reference structure to preserve:

- square centered panel
- title
- one score ring
- two metric rows
- three chips at the bottom

Prompt:

```text
Same composition as the reference image: a square resume analysis thumbnail with a title at the top, one central score ring showing 84, two compact metric rows below, and three rounded chips at the bottom. Restyle it into our current theme with a white card, blue accents, slate-blue text, pale blue-gray background, crisp border, and small soft shadow. Keep the thumbnail simple, centered, and very close to the original layout.
```

### `src/assets/carousel/thumb-job-match.png`

Reference structure to preserve:

- square card
- title top left
- match pill top right
- two long comparison bars
- checklist group at bottom left
- missing-skills group at bottom right

Prompt:

```text
Same composition as the reference image: a square job match thumbnail with the title in the upper left, a small 91 percent match pill in the upper right, two long horizontal comparison bars across the center, a checklist section in the lower left, and a missing-skills section in the lower right. Restyle it into our current theme using white and very light blue surfaces, slate-blue text, brand-blue bars, subtle green check states, muted warning accents for missing skills, clean borders, and soft shadow. Keep the layout almost identical to the reference image.
```

### `src/assets/carousel/thumb-cover-letter.png`

Reference structure to preserve:

- square card
- greeting at the top
- vertical accent rail on the left
- soft blurred text lines in two paragraph groups
- closing at the bottom

Prompt:

```text
Same composition as the reference image: a square cover letter thumbnail with a greeting at the top, a vertical accent rail on the left, soft text lines arranged in two grouped blocks, and a short closing line at the bottom. Restyle it into our current theme with a white document card, pale blue-gray background, slate-blue text treatment, a brand-blue accent rail, crisp border, and subtle shadow. Keep the exact content rhythm and composition from the reference while removing all neon and cosmic styling.
```

### `src/assets/carousel/thumb-interview.png`

Reference structure to preserve:

- square card
- top question bar
- one answer card in the center
- confidence pill at the bottom

Prompt:

```text
Same composition as the reference image: a square interview practice thumbnail with one rounded question bar at the top, one large answer card in the center, and one confidence status pill at the bottom. Restyle it into our current theme using a pale blue-gray background, white and soft-blue panels, dark slate text, brand-blue highlights, and a restrained success-green confidence pill. Keep the exact same module layout, sizing relationships, and centered composition as the reference image.
```

### `src/assets/carousel/thumb-career.png`

Reference structure to preserve:

- square card
- title at the top
- vertical roadmap line on the left
- four milestone rows
- duration pill at the bottom

Prompt:

```text
Same composition as the reference image: a square career roadmap thumbnail with the title at the top, a vertical roadmap line with milestone dots on the left, four role steps stacked vertically, and a small duration pill near the bottom. Restyle it into our current product theme using a white card, pale blue-gray background, slate-blue text, brand-blue timeline treatment, subtle muted-amber highlights only where helpful, thin borders, and soft shadow. Keep the same simple career-planning layout as the reference image.
```

### `src/assets/carousel/thumb-portfolio.png`

Reference structure to preserve:

- square card
- score pill at the top
- four project cards in a two-by-two grid
- tiny footer bar at the bottom

Prompt:

```text
Same composition as the reference image: a square portfolio thumbnail with a rounded score pill across the top, four project cards arranged in a two-by-two grid, and a small footer bar near the bottom. Restyle it into our current theme with white cards, pale blue-gray background, slate-blue text, a brand-blue score pill, subtle category accent strips, thin borders, and soft product-style shadows. Keep the structure and spacing almost identical to the reference image and make it feel like a polished social-platform business UI.
```

## Simple Re-Prompt Lines

If the model changes the layout too much:

```text
Closer to the reference image. Do not redesign. Match the original composition more tightly.
```

If the result is still too dark:

```text
Push it further into a light LinkedIn/Facebook-like SaaS theme: brighter background, whiter cards, less contrast, no glow.
```

If the result loses clarity at thumbnail size:

```text
Simplify the UI details and improve small-size readability while keeping the same layout.
```

## Practical Goal

When these prompts work correctly, the new outputs should feel like:

- the same images you already like
- the same content blocks and hierarchy
- the same recognizability in the carousel
- but fully translated into the product's current blue-white brand system

