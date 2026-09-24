import { describe, expect, it } from 'vitest'
import type { CvSection } from '#/lib/api/schemas'
import { buildPreviewSections, resolvePreviewStyle, splitTwoColumn } from '#/lib/cv-studio/preview'

describe('CV preview mirror of the server renderer', () => {
  it('applies template tokens, density scaling and the chosen font/accent', () => {
    expect(resolvePreviewStyle({ template_id: 'professional-editorial', font_id: 'pt-serif', accent_color: '#166534', density: 'spacious', ats_mode: false })).toMatchObject({
      layout: 'professional-editorial', accent: '#166534', bodyPt: 12, headingPt: 17, marginMm: 20, sectionGapPt: 11, titleAlign: 'center', twoColumn: false,
    })
    expect(resolvePreviewStyle({ template_id: 'technical-portfolio', font_id: 'lato', accent_color: '#111827', density: 'compact', ats_mode: false })).toMatchObject({
      bodyPt: 8, headingPt: 11, sectionGapPt: 5,
    })
  })

  it('forces the plain single-column layout in ATS mode', () => {
    const style = resolvePreviewStyle({ template_id: 'modern-two-column', font_id: 'crimson-text', accent_color: '#B91C1C', density: 'compact', ats_mode: true })
    expect(style).toMatchObject({ layout: 'ats-essential', accent: '#111827', bodyPt: 10, twoColumn: false, atsMode: true })
    expect(style.fontStack).toMatch(/Helvetica/)
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

  it('puts skills and certifications in the two-column sidebar, else the first section', () => {
    const make = (id: string, kind: CvSection['kind']) => ({ id, kind, title: id, entries: [] })
    expect(splitTwoColumn([make('s', 'summary'), make('k', 'skills')])).toEqual({ side: [make('k', 'skills')], main: [make('s', 'summary')] })
    expect(splitTwoColumn([make('s', 'summary'), make('e', 'experience')])).toEqual({ side: [make('s', 'summary')], main: [make('e', 'experience')] })
  })
})
