import { describe, expect, it } from 'vitest'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { tools } from '#/lib/tools/registry'

describe('historyToolDisplay', () => {
  it('passes a registry tool through', () => {
    const display = historyToolDisplay('resume')
    expect(display.kind).toBe('tool')
    expect(display.label).toBe(tools.resume.shortLabel)
    expect(display.icon).toBe(tools.resume.icon)
    expect(display.accent).toBe(tools.resume.accent)
  })

  it('names application drafts "Application"', () => {
    const display = historyToolDisplay('application-drafts')
    expect(display.label).toBe('Application')
    expect(display.icon).toBeTruthy()
  })

  it.each(['cv-quality', 'cv-tailoring'])('names %s "CV Studio"', (name) => {
    expect(historyToolDisplay(name).label).toBe('CV Studio')
  })

  it('humanizes unknown tags', () => {
    expect(historyToolDisplay('foo-bar').label).toBe('Foo bar')
  })
})

describe('historyRunHref', () => {
  it('opens registry tool results', () => {
    expect(historyRunHref({ id: 'r1', tool_name: 'resume' })).toBe('/resume/result/r1')
  })

  it('opens an application draft through its application, else the board', () => {
    expect(historyRunHref({ id: 'r', tool_name: 'application-drafts', workspace: { id: 'w1' } })).toBe('/campaigns/w1')
    expect(historyRunHref({ id: 'r', tool_name: 'application-drafts', workspace: null })).toBe('/campaigns')
  })

  it('has no page for older CV Studio runs', () => {
    expect(historyRunHref({ id: 'r', tool_name: 'cv-quality' })).toBeNull()
    expect(historyRunHref({ id: 'r', tool_name: 'weird' })).toBeNull()
  })
})
