import { describe, expect, it } from 'vitest'
import type { CvSection } from '#/lib/api/schemas'
import {
  addBullet, addEntry, addSection, moveBullet, moveEntry, moveSection, moveSectionTo, normalizeSections,
  removeBullet, removeEntry, removeSection, toSavableSections, updateBullet, updateEntry,
} from '#/lib/cv-studio/editor'

const experience = (): CvSection[] => [{
  id: 's', kind: 'experience', title: 'Experience', visible: true, position: 0, entries: [
    { id: 'e', evidence_item_id: null, body: 'Led the platform team.', position: 0, heading: 'Lead engineer', subheading: 'Acme', bullets: [] },
  ],
}]

describe('CV Studio structured editor', () => {
  it('adds typed sections and blank entries shaped for their section kind', () => {
    const sections = addSection([], 'experience')
    const withEntry = addEntry(sections, sections[0].id)
    expect(withEntry[0]).toMatchObject({ kind: 'experience', title: 'Experience', position: 0 })
    expect(withEntry[0].entries[0]).toMatchObject({ evidence_item_id: null, body: '', heading: '', bullets: [''] })
    const summary = addSection([], 'summary')
    expect(addEntry(summary, summary[0].id)[0].entries[0]).not.toHaveProperty('heading')
  })

  it('normalizes section and entry positions after keyboard reordering', () => {
    const sections = normalizeSections([
      { id: 'a', kind: 'summary', title: 'Summary', visible: true, position: 8, entries: [] },
      { id: 'b', kind: 'skills', title: 'Skills', visible: true, position: 3, entries: [] },
    ])
    expect(moveSection(sections, 1, -1).map((section) => [section.id, section.position])).toEqual([
      ['b', 0], ['a', 1],
    ])
  })

  it('moves a dragged section to its drop position', () => {
    const sections = normalizeSections(['a', 'b', 'c'].map((id) => ({ id, kind: 'custom' as const, title: id, visible: true, position: 0, entries: [] })))
    expect(moveSectionTo(sections, 0, 2).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(moveSectionTo(sections, 2, 0).map((s) => [s.id, s.position])).toEqual([['c', 0], ['a', 1], ['b', 2]])
    expect(moveSectionTo(sections, 1, 5)).toBe(sections)
    expect(removeSection(sections, 'b').map((s) => [s.id, s.position])).toEqual([['a', 0], ['c', 1]])
  })

  it('reorders and removes entries while keeping persisted positions dense', () => {
    const sections = [{ id: 's', kind: 'experience' as const, title: 'Experience', visible: true, position: 0, entries: [
      { id: 'one', evidence_item_id: null, body: 'One', position: 0 },
      { id: 'two', evidence_item_id: null, body: 'Two', position: 1 },
    ] }]
    expect(moveEntry(sections, 's', 1, -1)[0].entries.map((entry) => [entry.id, entry.position])).toEqual([['two', 0], ['one', 1]])
    expect(removeEntry(sections, 's', 'one')[0].entries.map((entry) => [entry.id, entry.position])).toEqual([['two', 0]])
  })

  it('keeps body in sync with bullet points and adopts an existing description as the first bullet', () => {
    let sections = addBullet(experience(), 's', 'e')
    expect(sections[0].entries[0].bullets).toEqual(['Led the platform team.', ''])
    sections = updateBullet(sections, 's', 'e', 1, 'Cut deploy time by 40%.')
    expect(sections[0].entries[0].body).toBe('Led the platform team.\nCut deploy time by 40%.')
    sections = moveBullet(sections, 's', 'e', 1, -1)
    expect(sections[0].entries[0].bullets).toEqual(['Cut deploy time by 40%.', 'Led the platform team.'])
    sections = removeBullet(sections, 's', 'e', 0)
    expect(sections[0].entries[0].body).toBe('Led the platform team.')
    sections = updateEntry(sections, 's', 'e', { location: 'Berlin' })
    expect(sections[0].entries[0]).toMatchObject({ location: 'Berlin', heading: 'Lead engineer' })
  })

  it('shapes the draft into an API-valid payload', () => {
    const draft: CvSection[] = [{
      id: 's', kind: 'experience', title: '  ', visible: true, position: 0, entries: [
        { id: 'blank', evidence_item_id: null, body: '', position: 0, heading: '', subheading: '', bullets: [''] },
        { id: 'role', evidence_item_id: null, body: '', position: 1, heading: 'Designer', subheading: ' ', location: '', start_date: '2021', end_date: '', bullets: ['  Shipped  ', ''] },
        { id: 'heading-only', evidence_item_id: null, body: '  ', position: 2, heading: 'Volunteer', bullets: [] },
      ],
    }]
    const [section] = toSavableSections(draft)
    expect(section.title).toBe('Experience')
    expect(section.entries).toEqual([
      { id: 'role', evidence_item_id: null, body: 'Shipped', position: 0, heading: 'Designer', subheading: null, location: null, start_date: '2021', end_date: null, bullets: ['Shipped'] },
      { id: 'heading-only', evidence_item_id: null, body: 'Volunteer', position: 1, heading: 'Volunteer', bullets: [] },
    ])
  })
})
