import { describe, expect, it } from 'vitest'
import { tools } from '#/lib/tools/registry'
import { adminDate, adminDateTime, labelNamesTool, toolLabel } from '#/pages/admin/toolLabel'

describe('toolLabel', () => {
  it('uses the registry name for known tools', () => {
    expect(toolLabel('resume')).toBe(tools.resume.label)
  })

  it('humanises backend-only ids', () => {
    expect(toolLabel('application-drafts')).toBe('Application drafts')
  })
})

describe('labelNamesTool', () => {
  it('is true when the label already says which tool made the run', () => {
    expect(labelNamesTool('Job Match (75%)', 'job-match')).toBe(true)
    expect(labelNamesTool('Resume Analysis (77/100)', 'resume')).toBe(true)
  })

  it('is false for a label the user chose', () => {
    expect(labelNamesTool('Backend application', 'cover-letter')).toBe(false)
  })
})

describe('admin dates', () => {
  it('shows the year only outside the current one', () => {
    const year = new Date().getFullYear()
    expect(adminDate(`${year}-03-04T12:00:00Z`)).not.toContain(String(year))
    expect(adminDate('2019-03-04T12:00:00Z')).toContain('2019')
    expect(adminDate(null)).toBe('')
  })

  it('adds the time for rows that repeat within a day', () => {
    expect(adminDateTime('2019-03-04T12:00:00Z')).toMatch(/2019, .*\d/)
  })
})
