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
    { id: 'lagoon', name: 'Lagoon', description: 'Teal sidebar.', ats_safe: false, columns: 2, photo_slot: true, group: 'more', typefaces: { heading: 'Source Sans 3', body: 'Source Sans 3' }, title_align: 'left', margin_mm: 14, sidebar_kinds: ['skills', 'certifications'], docx_note: 'Word version uses a single column.', default_accent: '#0F766E', sizes: sizes(9, 12, 6) },
  ],
  fonts: [
    { id: 'inter', name: 'Inter', category: 'sans-serif', css_family: "'Inter', sans-serif" },
    { id: 'source-sans-3', name: 'Source Sans 3', category: 'sans-serif', css_family: "'Source Sans 3', sans-serif" },
    { id: 'ibm-plex-sans', name: 'IBM Plex Sans', category: 'sans-serif', css_family: "'IBM Plex Sans', sans-serif" },
    { id: 'source-serif-4', name: 'Source Serif 4', category: 'serif', css_family: "'Source Serif 4', serif" },
    { id: 'lora', name: 'Lora', category: 'serif', css_family: "'Lora', serif" },
    { id: 'eb-garamond', name: 'EB Garamond', category: 'serif', css_family: "'EB Garamond', serif" },
  ],
  palette: [
    { value: '#111827', name: 'Ink' }, { value: '#7C2D12', name: 'Rust' }, { value: '#075985', name: 'Ocean' },
    { value: '#166534', name: 'Forest' }, { value: '#6D28D9', name: 'Violet' }, { value: '#B91C1C', name: 'Crimson' },
    { value: '#0F766E', name: 'Teal' }, { value: '#9D174D', name: 'Plum' }, { value: '#334155', name: 'Slate' },
    { value: '#B45309', name: 'Amber' },
  ],
  densities: [{ id: 'compact', name: 'Compact' }, { id: 'normal', name: 'Balanced' }, { id: 'spacious', name: 'Roomy' }],
  ats_mode: { template_id: 'classic', offered_template_ids: ['classic', 'executive'], density: 'normal', accent: '#111827', css_family: 'Helvetica, sans-serif' },
})
