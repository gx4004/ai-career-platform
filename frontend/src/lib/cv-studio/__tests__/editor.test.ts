import { describe, expect, it } from 'vitest'
import { addEntry, addSection, moveEntry, moveSection, normalizeSections } from '#/lib/cv-studio/editor'

describe('CV Studio structured editor', () => {
  it('adds typed sections and entries without freeform document state', () => {
    const sections = addSection([], 'experience')
    const withEntry = addEntry(sections, sections[0].id)
    expect(withEntry[0]).toMatchObject({ kind: 'experience', title: 'Experience', position: 0 })
    expect(withEntry[0].entries[0]).toMatchObject({ evidence_item_id: null, body: 'New entry', position: 0 })
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

  it('reorders entries and updates their persisted positions', () => {
    const sections = [{ id: 's', kind: 'experience' as const, title: 'Experience', visible: true, position: 0, entries: [
      { id: 'one', evidence_item_id: null, body: 'One', position: 0 },
      { id: 'two', evidence_item_id: null, body: 'Two', position: 1 },
    ] }]
    expect(moveEntry(sections, 's', 1, -1)[0].entries.map((entry) => [entry.id, entry.position])).toEqual([['two', 0], ['one', 1]])
  })
})
