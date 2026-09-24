import type { CvSection, CvStyle, CvTemplateId } from '#/lib/api/schemas'
import { CV_ACCENT_PALETTE } from '#/lib/api/schemas'

/**
 * Client mirror of `backend/app/services/cv_rendering.py`
 * (`TEMPLATES`, `resolve_effective_style`, `build_render_model`, `_entry_flow`).
 *
 * The browser preview renders the *unsaved* draft with these tokens so the
 * paper updates while the person types. The server-rendered PDF stays the
 * export of record; keep the numbers here in step with the backend table.
 */

type TemplateTokens = {
  /** Built-in PDF face the legacy template uses (only reached in ATS mode now). */
  font: 'sans' | 'serif' | 'mono'
  accent: string
  bodyPt: number
  headingPt: number
  marginMm: number
  sectionGapPt: number
}

export const TEMPLATE_TOKENS: Record<CvTemplateId, TemplateTokens> = {
  'ats-essential': { font: 'sans', accent: '#111827', bodyPt: 10, headingPt: 13, marginMm: 18, sectionGapPt: 6 },
  'professional-editorial': { font: 'serif', accent: '#7C2D12', bodyPt: 10, headingPt: 15, marginMm: 20, sectionGapPt: 8 },
  'technical-portfolio': { font: 'mono', accent: '#075985', bodyPt: 9, headingPt: 12, marginMm: 16, sectionGapPt: 7 },
  'modern-two-column': { font: 'sans', accent: '#1D4ED8', bodyPt: 9, headingPt: 12, marginMm: 14, sectionGapPt: 6 },
  'minimal-serif': { font: 'serif', accent: '#374151', bodyPt: 10, headingPt: 13, marginMm: 20, sectionGapPt: 7 },
}

export const ATS_SAFE_TEMPLATES: ReadonlySet<CvTemplateId> = new Set([
  'ats-essential', 'professional-editorial', 'technical-portfolio', 'minimal-serif',
])

const DENSITY_SCALE = { compact: 0.88, normal: 1, spacious: 1.15 } as const
const DENSITY_GAP_SCALE = { compact: 0.7, normal: 1, spacious: 1.4 } as const

/** Google Fonts equivalents of the OFL families bundled with the backend renderer. */
export const FONT_STACKS: Record<CvStyle['font_id'], string> = {
  lato: "'Lato', 'Helvetica Neue', Arial, sans-serif",
  'pt-sans': "'PT Sans', 'Helvetica Neue', Arial, sans-serif",
  'pt-serif': "'PT Serif', Georgia, 'Times New Roman', serif",
  'crimson-text': "'Crimson Text', Georgia, 'Times New Roman', serif",
  'ibm-plex-mono': "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace",
}
const ATS_FONT_STACK = "Helvetica, Arial, 'Liberation Sans', sans-serif"

export const DEFAULT_STYLE: CvStyle = {
  template_id: 'ats-essential', font_id: 'lato', accent_color: '#111827', density: 'normal', ats_mode: false,
}

export const ACCENT_NAMES: Record<(typeof CV_ACCENT_PALETTE)[number], string> = {
  '#111827': 'Ink', '#7C2D12': 'Rust', '#075985': 'Ocean', '#166534': 'Forest',
  '#6D28D9': 'Violet', '#B91C1C': 'Crimson', '#0F766E': 'Teal',
}

export type EffectivePreviewStyle = {
  layout: CvTemplateId
  fontStack: string
  accent: string
  bodyPt: number
  headingPt: number
  marginMm: number
  sectionGapPt: number
  titleAlign: 'left' | 'center'
  twoColumn: boolean
  atsMode: boolean
}

export function resolvePreviewStyle(style: CvStyle): EffectivePreviewStyle {
  const ats = style.ats_mode
  const layout: CvTemplateId = ats ? 'ats-essential' : style.template_id
  const tokens = TEMPLATE_TOKENS[layout]
  const density = ats ? 'normal' : style.density
  return {
    layout,
    fontStack: ats ? ATS_FONT_STACK : FONT_STACKS[style.font_id],
    accent: ats ? '#111827' : style.accent_color,
    bodyPt: Math.max(8, Math.round(tokens.bodyPt * DENSITY_SCALE[density])),
    headingPt: Math.max(10, Math.round(tokens.headingPt * DENSITY_SCALE[density])),
    marginMm: tokens.marginMm,
    sectionGapPt: Math.max(3, Math.round(tokens.sectionGapPt * DENSITY_GAP_SCALE[density])),
    titleAlign: layout === 'professional-editorial' ? 'center' : 'left',
    twoColumn: !ats && layout === 'modern-two-column',
    atsMode: ats,
  }
}

export type PreviewEntry = {
  id: string
  /** Freeform paragraph (legacy entries, or structured entries without bullets). */
  text: string | null
  heading: string | null
  subheading: string | null
  location: string | null
  dates: string | null
  bullets: string[]
}
export type PreviewSection = { id: string; kind: CvSection['kind']; title: string; entries: PreviewEntry[] }

const clean = (value: string | null | undefined) => {
  const text = (value ?? '').split(/\s+/).filter(Boolean).join(' ')
  return text || null
}

/** Visible sections in reading order, with each entry shaped like the PDF lays it out. */
export function buildPreviewSections(sections: CvSection[]): PreviewSection[] {
  return [...sections]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .filter((section) => section.visible)
    .map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title.trim(),
      entries: [...section.entries]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((entry) => {
          const text = clean(entry.body)
          const heading = clean(entry.heading)
          const bullets = (entry.bullets ?? []).map((bullet) => clean(bullet)).filter((b): b is string => Boolean(b))
          if (heading === null) {
            return { id: entry.id, text, heading: null, subheading: null, location: null, dates: null, bullets: [] }
          }
          const dates = [clean(entry.start_date), clean(entry.end_date)].filter(Boolean).join(' – ') || null
          return {
            id: entry.id,
            text: bullets.length === 0 && text && text !== heading ? text : null,
            heading,
            subheading: clean(entry.subheading),
            location: clean(entry.location),
            dates,
            bullets,
          }
        }),
    }))
}

const SIDEBAR_KINDS = new Set<CvSection['kind']>(['skills', 'certifications'])

/** The two-column template's sidebar/main split, identical to `_render_pdf_two_column`. */
export function splitTwoColumn(sections: PreviewSection[]) {
  let side = sections.filter((section) => SIDEBAR_KINDS.has(section.kind))
  let main = sections.filter((section) => !SIDEBAR_KINDS.has(section.kind))
  if (side.length === 0 && main.length > 0) {
    side = main.slice(0, 1)
    main = main.slice(1)
  }
  return { side, main }
}

