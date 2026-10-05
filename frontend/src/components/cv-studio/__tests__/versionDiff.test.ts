import { describe, expect, it } from 'vitest'
import { describeDiff, diffVersion } from '#/components/cv-studio/versionDiff'
import type { CvSection } from '#/lib/api/schemas'

const entry = (id: string, bullets: string[], heading = 'Engineer') => ({
  id, evidence_item_id: null, body: bullets.join('\n'), position: 0, heading, subheading: 'Acme', location: null, start_date: '2020', end_date: 'Present', bullets,
})
const section = (entries: ReturnType<typeof entry>[]): CvSection => ({ id: 's', kind: 'experience', title: 'Experience', visible: true, position: 0, entries })

describe('diffVersion', () => {
  const current = [section([entry('a', ['Shipped it.']), entry('b', ['Fixed it.'], 'Designer')])]

  it('calls identical wording the same, whatever the entry positions', () => {
    expect(diffVersion(current, current)).toEqual({ changed: 0, added: 0, removed: 0 })
    expect(describeDiff({ changed: 0, added: 0, removed: 0 })).toBe('Same wording as your CV now')
  })

  it('counts reworded entries, entries only in the version and entries only in the CV now', () => {
    const version = [section([entry('a', ['Shipped it, for hiring teams.']), entry('c', ['New.'])])]
    const diff = diffVersion(version, current)
    expect(diff).toEqual({ changed: 1, added: 1, removed: 1 })
    expect(describeDiff(diff)).toBe('Differs from your CV now: 1 entry reworded, 1 entry not in your CV now, 1 entry only in your CV now')
  })

  it('ignores whitespace around highlights', () => {
    const version = [section([entry('a', ['  Shipped it.  ']), entry('b', ['Fixed it.'], 'Designer')])]
    expect(diffVersion(version, current).changed).toBe(0)
  })
})
