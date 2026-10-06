import { describe, expect, it } from 'vitest'
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  applyFieldEdits,
  contentEntries,
  KIND_SINGULAR_LABELS,
  countByState,
  factDisplay,
  groupItemsByKind,
} from '#/lib/profile/evidence'

function item(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'id',
    kind: 'skill',
    content: { text: 'x' },
    provenance: 'imported',
    confirmation_state: 'unconfirmed',
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  }
}

describe('groupItemsByKind', () => {
  it('groups items into the canonical kind order and drops empty kinds', () => {
    const groups = groupItemsByKind([
      item({ id: '1', kind: 'skill' }),
      item({ id: '2', kind: 'experience' }),
      item({ id: '3', kind: 'skill' }),
    ])

    expect(groups.map((g) => g.kind)).toEqual(['experience', 'skill'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['1', '3'])
    expect(groups[0].label).toBe('Experience')
  })

  it('returns an empty array for no items', () => {
    expect(groupItemsByKind([])).toEqual([])
  })
})

describe('countByState', () => {
  it('tallies items by confirmation state', () => {
    const counts = countByState([
      item({ id: '1', confirmation_state: 'confirmed' }),
      item({ id: '2', confirmation_state: 'unconfirmed' }),
      item({ id: '3', confirmation_state: 'confirmed' }),
    ])

    expect(counts).toEqual({ total: 3, confirmed: 2, unconfirmed: 1 })
  })
})

describe('contentEntries', () => {
  it('coerces scalar and object values to display strings', () => {
    const entries = contentEntries({ title: 'Engineer', years: 4, nested: { a: 1 } })
    expect(entries).toEqual([
      { key: 'title', value: 'Engineer' },
      { key: 'years', value: '4' },
      { key: 'nested', value: '{"a":1}' },
    ])
  })
})

describe('applyFieldEdits', () => {
  it('writes edited text back, drops cleared fields and keeps untouched non-text values', () => {
    const content = { title: 'Engineer', company: 'Acme', years: 4 }
    expect(applyFieldEdits(content, { title: 'Staff Engineer', company: '  ', years: '4' })).toEqual({
      ok: true,
      value: { title: 'Staff Engineer', years: 4 },
    })
  })

  it('refuses to save a fact with every field cleared', () => {
    expect(applyFieldEdits({ title: 'Engineer' }, { title: '' })).toMatchObject({ ok: false })
  })

  it('says which field is too long instead of letting the API cut it', () => {
    expect(applyFieldEdits({ text: 'x' }, { text: 'a'.repeat(2001) })).toEqual({
      ok: false,
      error: 'Shorten text to 2,000 characters.',
    })
    expect(applyFieldEdits({ text: 'x' }, { text: 'a'.repeat(2000) })).toMatchObject({ ok: true })
  })
})

describe('factDisplay', () => {
  it('uses the value as the title for single-field kinds, with no field label', () => {
    const result = factDisplay(item({ kind: 'skill', content: { text: 'TypeScript' } }))
    expect(result.title).toBe('TypeScript')
    expect(result.fields).toEqual([])
    expect(factDisplay(item({ kind: 'achievement', content: { achievements: 'Cut latency 40%' } })).title).toBe('Cut latency 40%')
  })

  it('keeps labelled fields for multi-field kinds', () => {
    const result = factDisplay(item({ kind: 'experience', content: { job_title: 'Engineer', company: 'Acme' } }))
    expect(result.title).toBeNull()
    expect(result.fields.map((field) => field.label)).toEqual(['Job title', 'Company'])
  })

  it('has a singular label for every kind', () => {
    expect(KIND_SINGULAR_LABELS.skill).toBe('Skill')
    expect(KIND_SINGULAR_LABELS.achievement).toBe('Achievement')
  })
})
