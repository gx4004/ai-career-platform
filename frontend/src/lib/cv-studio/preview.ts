import type { CvSection, CvStyle, CvStyleCatalog, CvTemplateId } from '#/lib/api/schemas'

/**
 * The browser preview renders the *unsaved* draft so the paper updates while the
 * person types. Every design value (sizes, margins, fonts, alignment, sidebar
 * kinds, ATS-mode overrides) is looked up in the backend style catalog, the same
 * table the PDF/DOCX renderer uses; the server-rendered PDF stays the export of record.
 */
export type EffectivePreviewStyle = {
  layout: CvTemplateId
  fontStack: string
  accent: string
  bodyPt: number
  headingPt: number
  marginMm: number
  sectionGapPt: number
  titleAlign: 'left' | 'center'
  /** Section kinds in the sidebar column; empty for single-column layouts. */
  sidebarKinds: CvSection['kind'][]
  atsMode: boolean
}

export function resolvePreviewStyle(style: CvStyle, catalog: CvStyleCatalog): EffectivePreviewStyle {
  const ats = style.ats_mode ? catalog.ats_mode : null
  const layout = ats?.template_id ?? style.template_id
  const template = catalog.templates.find((item) => item.id === layout) ?? catalog.templates[0]
  const sizes = template.sizes[ats?.density ?? style.density]
  const font = catalog.fonts.find((item) => item.id === style.font_id) ?? catalog.fonts[0]
  return {
    layout: template.id,
    fontStack: ats?.css_family ?? font.css_family,
    accent: ats?.accent ?? style.accent_color,
    bodyPt: sizes.body_pt,
    headingPt: sizes.heading_pt,
    marginMm: template.margin_mm,
    sectionGapPt: sizes.section_gap_pt,
    titleAlign: template.title_align,
    sidebarKinds: template.sidebar_kinds,
    atsMode: Boolean(ats),
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

/** The two-column sidebar/main split, identical to the renderer's `_split_sidebar`. */
export function splitTwoColumn(sections: PreviewSection[], sidebarKinds: CvSection['kind'][]) {
  let side = sections.filter((section) => sidebarKinds.includes(section.kind))
  let main = sections.filter((section) => !sidebarKinds.includes(section.kind))
  if (side.length === 0 && main.length > 0) {
    side = main.slice(0, 1)
    main = main.slice(1)
  }
  return { side, main }
}
