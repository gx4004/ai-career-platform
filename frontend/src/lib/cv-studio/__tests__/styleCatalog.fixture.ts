import { cvStyleCatalogSchema } from '#/lib/api/schemas'
import type { CvStyleCatalog } from '#/lib/api/schemas'

const sizes = (body: number, heading: number, gap: number) => ({
  compact: { body_pt: body - 1, heading_pt: heading - 2, section_gap_pt: gap - 2 },
  normal: { body_pt: body, heading_pt: heading, section_gap_pt: gap },
  spacious: { body_pt: body + 2, heading_pt: heading + 2, section_gap_pt: gap + 3 },
})

/** A `GET /cv-documents/style-catalog` response, parsed through the real Zod schema. */
export const styleCatalogFixture: CvStyleCatalog = cvStyleCatalogSchema.parse({
  templates: [
    { id: 'ats-essential', name: 'ATS Essential', description: 'Single column.', ats_safe: true, title_align: 'left', margin_mm: 18, sidebar_kinds: [], sizes: sizes(10, 13, 6) },
    { id: 'professional-editorial', name: 'Professional Editorial', description: 'Centred name.', ats_safe: true, title_align: 'center', margin_mm: 20, sidebar_kinds: [], sizes: sizes(10, 15, 8) },
    { id: 'modern-two-column', name: 'Modern Two-Column', description: 'Sidebar.', ats_safe: false, title_align: 'left', margin_mm: 14, sidebar_kinds: ['skills', 'certifications'], sizes: sizes(9, 12, 6) },
  ],
  fonts: [
    { id: 'lato', name: 'Lato', category: 'sans-serif', css_family: "'Lato', sans-serif" },
    { id: 'pt-serif', name: 'PT Serif', category: 'serif', css_family: "'PT Serif', serif" },
  ],
  palette: [{ value: '#111827', name: 'Ink' }, { value: '#075985', name: 'Ocean' }],
  densities: [{ id: 'compact', name: 'Compact' }, { id: 'normal', name: 'Balanced' }, { id: 'spacious', name: 'Roomy' }],
  ats_mode: { template_id: 'ats-essential', density: 'normal', accent: '#111827', css_family: 'Helvetica, sans-serif' },
})
