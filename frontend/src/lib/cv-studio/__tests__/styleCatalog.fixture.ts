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
    { id: 'classic', name: 'Classic', description: 'A quiet single column.', ats_safe: true, columns: 1, photo_slot: false, group: 'ats-safe', typefaces: { heading: 'Source Serif 4', body: 'Source Sans 3' }, title_align: 'center', margin_mm: 17, sidebar_kinds: [], sizes: sizes(10, 13, 6) },
    { id: 'executive', name: 'Executive', description: 'A light serif name, airy.', ats_safe: true, columns: 1, photo_slot: false, group: 'ats-safe', typefaces: { heading: 'Source Serif 4', body: 'Source Sans 3' }, title_align: 'left', margin_mm: 20, sidebar_kinds: [], sizes: sizes(10, 15, 8) },
    { id: 'lagoon', name: 'Lagoon', description: 'Teal sidebar.', ats_safe: false, columns: 2, photo_slot: true, group: 'more', typefaces: { heading: 'Source Sans 3', body: 'Source Sans 3' }, title_align: 'left', margin_mm: 14, sidebar_kinds: ['skills', 'certifications'], sizes: sizes(9, 12, 6) },
  ],
  fonts: [
    { id: 'lato', name: 'Lato', category: 'sans-serif', css_family: "'Lato', sans-serif" },
    { id: 'pt-serif', name: 'PT Serif', category: 'serif', css_family: "'PT Serif', serif" },
  ],
  palette: [{ value: '#111827', name: 'Ink' }, { value: '#075985', name: 'Ocean' }],
  densities: [{ id: 'compact', name: 'Compact' }, { id: 'normal', name: 'Balanced' }, { id: 'spacious', name: 'Roomy' }],
  ats_mode: { template_id: 'classic', offered_template_ids: ['classic', 'executive'], density: 'normal', accent: '#111827', css_family: 'Helvetica, sans-serif' },
})
