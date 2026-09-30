import { describe, expect, it } from 'vitest'
import { tools } from '#/lib/tools/registry'
import { toolLabel } from '#/pages/admin/toolLabel'

describe('toolLabel', () => {
  it('uses the registry name for known tools', () => {
    expect(toolLabel('resume')).toBe(tools.resume.label)
  })

  it('humanises backend-only ids', () => {
    expect(toolLabel('application-drafts')).toBe('Application drafts')
  })
})
