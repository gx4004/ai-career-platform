import { CV_ACCENT_PALETTE } from '#/lib/api/schemas'
import type { CvAtsCheckKey, CvQualityResponse, CvStyleCatalog, CvTemplateId } from '#/lib/api/schemas'

export const TEMPLATE_NAMES: Record<CvTemplateId, string> = {
  'ats-essential': 'ATS Essential',
  'professional-editorial': 'Professional Editorial',
  'technical-portfolio': 'Technical / Portfolio',
  'modern-two-column': 'Modern Two-Column',
  'minimal-serif': 'Minimal Serif',
}

/**
 * Used until (or if) `GET /cv-documents/style-catalog` answers, so the design
 * controls never render empty. Mirrors the backend catalog.
 */
export const FALLBACK_STYLE_CATALOG: CvStyleCatalog = {
  templates: [
    { id: 'ats-essential', name: 'ATS Essential', description: 'Clean single column that every application system reads.', ats_safe: true },
    { id: 'professional-editorial', name: 'Professional Editorial', description: 'Centred name and roomy headings for a classic look.', ats_safe: true },
    { id: 'technical-portfolio', name: 'Technical / Portfolio', description: 'Compact and precise, made for technical roles.', ats_safe: true },
    { id: 'modern-two-column', name: 'Modern Two-Column', description: 'Skills in a sidebar beside your experience.', ats_safe: false },
    { id: 'minimal-serif', name: 'Minimal Serif', description: 'A quiet serif layout with generous white space.', ats_safe: true },
  ],
  fonts: [
    { id: 'lato', name: 'Lato', category: 'sans-serif' },
    { id: 'pt-sans', name: 'PT Sans', category: 'sans-serif' },
    { id: 'pt-serif', name: 'PT Serif', category: 'serif' },
    { id: 'crimson-text', name: 'Crimson Text', category: 'serif' },
    { id: 'ibm-plex-mono', name: 'IBM Plex Mono', category: 'monospace' },
  ],
  palette: [...CV_ACCENT_PALETTE],
  densities: ['compact', 'normal', 'spacious'],
}

export const DENSITY_LABELS = { compact: 'Compact', normal: 'Balanced', spacious: 'Roomy' } as const

/** Plain-language names for the named checks (the API labels are technical). */
export const CHECK_COPY: Record<CvAtsCheckKey, { label: string; description: string; fix: string }> = {
  section_structure: {
    label: 'Clear section headings',
    description: 'Application systems look for standard sections such as Experience and Skills.',
    fix: 'Add an Experience section and a Skills section so application systems can find them.',
  },
  text_layer: {
    label: 'Text can be read',
    description: 'Every line in your PDF is real text, not an image.',
    fix: 'Some text in the PDF could not be read. Keep your content as typed text.',
  },
  links: {
    label: 'Links work',
    description: 'Web addresses in your CV open when clicked.',
    fix: 'A link in your CV does not work. Check the web addresses you included.',
  },
  page_breaks: {
    label: 'Tidy page breaks',
    description: 'No entry is split awkwardly across two pages.',
    fix: 'An entry splits across pages. Shorten it or move it so it fits on one page.',
  },
  re_importability: {
    label: 'Reads back correctly',
    description: 'When we read your PDF back in, every section comes back in the right order.',
    fix: 'Some sections did not read back in order. Try ATS-friendly mode or a single-column template.',
  },
}

const TEMPLATE_FIX = 'Your template uses two columns, which some application systems read out of order. Turn on ATS-friendly mode or pick a single-column template.'

/** Turns the API's fix list into friendly sentences, one per issue. */
export function friendlyAtsFixes(quality: Pick<CvQualityResponse, 'ats_checks' | 'ats_fixes'>): string[] {
  const failed = quality.ats_checks.filter((check) => check.status === 'fail')
  const fromChecks = new Map(failed.map((check) => [check.remediation, CHECK_COPY[check.key].fix]))
  const fixes = quality.ats_fixes.map((fix) => fromChecks.get(fix) ?? (/template|column/i.test(fix) ? TEMPLATE_FIX : fix))
  for (const check of failed) {
    const copy = CHECK_COPY[check.key].fix
    if (!fixes.includes(copy)) fixes.push(copy)
  }
  return [...new Set(fixes)]
}
