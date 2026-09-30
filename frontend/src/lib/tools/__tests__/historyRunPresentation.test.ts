import { describe, expect, it } from 'vitest'
import { historyRunPresentation, humanizeToolName } from '#/lib/tools/historyRunPresentation'

describe('historyRunPresentation', () => {
  it('presents application drafts as "Application" linking to the board', () => {
    const p = historyRunPresentation('application-drafts', 'run-1')
    expect(p.label).toBe('Application')
    expect(p.route).toBe('/campaigns')
    expect(p.icon).not.toBeNull()
  })

  it('uses the registry for the six tools', () => {
    const p = historyRunPresentation('resume', 'abc')
    expect(p.isTool).toBe(true)
    expect(p.route).toContain('abc')
  })

  it('humanises unknown names instead of returning the raw identifier', () => {
    expect(humanizeToolName('cv_quality-check')).toBe('Cv quality check')
    expect(historyRunPresentation('some-new_tool', 'x').label).toBe('Some new tool')
    expect(historyRunPresentation('some-new_tool', 'x').route).toBe('/history')
    expect(humanizeToolName('')).toBe('Saved run')
  })
})
