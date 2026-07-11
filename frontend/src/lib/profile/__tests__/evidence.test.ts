import { describe, expect, it } from 'vitest'
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  contentEntries,
  contentToEditableText,
  countByState,
  groupItemsByKind,
  parseEditableText,
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
      item({ id: '3', confirmation_state: 'rejected' }),
      item({ id: '4', confirmation_state: 'confirmed' }),
    ])

    expect(counts).toEqual({ total: 4, confirmed: 2, unconfirmed: 1, rejected: 1 })
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

describe('parseEditableText / contentToEditableText round trip', () => {
  it('parses a valid JSON object', () => {
    const text = contentToEditableText({ title: 'Engineer' })
    const parsed = parseEditableText(text)
    expect(parsed).toEqual({ ok: true, value: { title: 'Engineer' } })
  })

  it('rejects empty input', () => {
    expect(parseEditableText('   ')).toEqual({ ok: false, error: 'Content cannot be empty.' })
  })

  it('rejects invalid JSON', () => {
    expect(parseEditableText('{not json')).toMatchObject({ ok: false })
  })

  it('rejects a non-object JSON value', () => {
    expect(parseEditableText('[1,2]')).toMatchObject({ ok: false })
    expect(parseEditableText('"hi"')).toMatchObject({ ok: false })
  })

  it('rejects an empty object', () => {
    expect(parseEditableText('{}')).toMatchObject({ ok: false })
  })
})
