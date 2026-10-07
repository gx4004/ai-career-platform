import { describe, expect, it } from 'vitest'
import type { CvSection } from '#/lib/api/schemas'
import { buildPreviewSections, resolvePreviewStyle, splitTwoColumn } from '#/lib/cv-studio/preview'
import { styleCatalogFixture as catalog } from './styleCatalog.fixture'

describe('CV preview built from the backend style catalog', () => {
  it('looks up the template sizes for the chosen density, font and accent', () => {
    expect(resolvePreviewStyle({ template_id: 'executive', font_id: 'pt-serif', accent_color: '#166534', density: 'spacious', ats_mode: false, page_size: 'a4', fit_one_page: false }, catalog)).toEqual({
      layout: 'executive', fontStack: "'PT Serif', serif", accent: '#166534',
      bodyPt: 12, headingPt: 17, marginMm: 20, sectionGapPt: 11, titleAlign: 'left', sidebarKinds: [], atsMode: false,
    })
  })

  it('applies the catalog’s ATS-mode overrides whatever the saved style says', () => {
    const style = resolvePreviewStyle({ template_id: 'lagoon', font_id: 'pt-serif', accent_color: '#B91C1C', density: 'compact', ats_mode: true, page_size: 'a4', fit_one_page: false }, catalog)
    expect(style).toMatchObject({ layout: 'classic', accent: '#111827', bodyPt: 10, sidebarKinds: [], atsMode: true, fontStack: 'Helvetica, sans-serif' })
  })

  it('falls back to the first catalog template for an id that has no template yet', () => {
    const style = resolvePreviewStyle({ template_id: 'ledger', font_id: null, accent_color: '#111827', density: 'normal', ats_mode: false, page_size: 'a4', fit_one_page: false }, catalog)
    expect(style.layout).toBe('classic')
    expect(style.fontStack).toBe("'Lato', sans-serif")
  })

  it('lays out entries the way the PDF does and hides hidden sections', () => {
    const sections: CvSection[] = [
      { id: 'b', kind: 'experience', title: ' Experience ', visible: true, position: 1, entries: [
        { id: 'x', evidence_item_id: null, body: 'Did  things', position: 0, heading: 'Lead', subheading: 'Acme', start_date: '2020', end_date: 'Now', bullets: ['One', ' '] },
        { id: 'y', evidence_item_id: null, body: 'Mentor', position: 1, heading: 'Mentor', bullets: [] },
        { id: 'z', evidence_item_id: null, body: 'Plain   text', position: 2 },
      ] },
      { id: 'a', kind: 'summary', title: 'Summary', visible: true, position: 0, entries: [] },
      { id: 'c', kind: 'skills', title: 'Skills', visible: false, position: 2, entries: [] },
    ]
    const preview = buildPreviewSections(sections)
    expect(preview.map((section) => section.id)).toEqual(['a', 'b'])
    expect(preview[1].title).toBe('Experience')
    expect(preview[1].entries).toEqual([
      { id: 'x', text: null, heading: 'Lead', subheading: 'Acme', location: null, dates: '2020 – Now', bullets: ['One'] },
      { id: 'y', text: null, heading: 'Mentor', subheading: null, location: null, dates: null, bullets: [] },
      { id: 'z', text: 'Plain text', heading: null, subheading: null, location: null, dates: null, bullets: [] },
    ])
  })

  it('puts the catalog’s sidebar kinds in the sidebar, else the first section', () => {
    const make = (id: string, kind: CvSection['kind']) => ({ id, kind, title: id, entries: [] })
    const sidebar = catalog.templates.find((template) => template.id === 'lagoon')!.sidebar_kinds
    expect(splitTwoColumn([make('s', 'summary'), make('k', 'skills')], sidebar)).toEqual({ side: [make('k', 'skills')], main: [make('s', 'summary')] })
    expect(splitTwoColumn([make('s', 'summary'), make('e', 'experience')], sidebar)).toEqual({ side: [make('s', 'summary')], main: [make('e', 'experience')] })
  })
})
