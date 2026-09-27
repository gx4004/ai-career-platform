import { CV_ACCENT_PALETTE } from '#/lib/api/schemas'
import type { CvStyleCatalog, CvTemplateId } from '#/lib/api/schemas'

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
