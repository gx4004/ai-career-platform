import { describe, expect, it } from 'vitest'
import { roleOnly } from '#/components/applications/stages'

describe('roleOnly', () => {
  it('strips a trailing company from a stored label', () => {
    expect(roleOnly('Platform Engineer at Acme Systems', 'Acme Systems')).toBe('Platform Engineer')
    expect(roleOnly('SRE @ Acme (EU)', 'Acme (EU)')).toBe('SRE')
  })
  it('leaves other titles alone', () => {
    expect(roleOnly('Engineer at Scale', 'Acme')).toBe('Engineer at Scale')
    expect(roleOnly('Acme', 'Acme')).toBe('Acme')
  })
})
