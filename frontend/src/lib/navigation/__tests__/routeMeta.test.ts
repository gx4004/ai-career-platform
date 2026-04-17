import { describe, expect, it } from 'vitest'
import { getRouteMeta } from '#/lib/navigation/routeMeta'

describe('getRouteMeta', () => {
  it('returns the dashboard shell descriptor', () => {
    const meta = getRouteMeta('/dashboard')
    expect(meta.title).toBe('Dashboard')
    expect(meta.sectionLabel).toBe('Command center')
    expect(meta.breadcrumbs).toEqual(['Dashboard'])
    expect(meta.topbarVariant).toBe('compact')
  })

  it('returns history, account, and settings with compact topbar + breadcrumb trails', () => {
    expect(getRouteMeta('/history').title).toBe('Run History')
    expect(getRouteMeta('/history').breadcrumbs).toEqual(['Dashboard', 'History'])
    expect(getRouteMeta('/account').title).toBe('Account')
    expect(getRouteMeta('/account').breadcrumbs).toEqual(['Dashboard', 'Account'])
    expect(getRouteMeta('/settings').title).toBe('Settings')
    expect(getRouteMeta('/settings').breadcrumbs).toEqual(['Dashboard', 'Settings'])
  })

  it('labels tool routes by their group', () => {
    expect(getRouteMeta('/resume').sectionLabel).toBe('Core flow')
    expect(getRouteMeta('/job-match').sectionLabel).toBe('Core flow')
    expect(getRouteMeta('/cover-letter').sectionLabel).toBe('Application support')
    expect(getRouteMeta('/interview').sectionLabel).toBe('Application support')
    expect(getRouteMeta('/career').sectionLabel).toBe('Planning')
    expect(getRouteMeta('/portfolio').sectionLabel).toBe('Planning')
  })

  it('uses the tool name in breadcrumbs on tool pages', () => {
    const meta = getRouteMeta('/resume')
    expect(meta.breadcrumbs[0]).toBe('Dashboard')
    expect(meta.breadcrumbs[1]).toMatch(/Resume/i)
  })

  it('identifies result pages and appends "Result" to the breadcrumb', () => {
    const meta = getRouteMeta('/resume/result/abc-123')
    expect(meta.sectionLabel).toBe('Results')
    expect(meta.breadcrumbs).toEqual(['Dashboard', expect.any(String), 'Result'])
    expect(meta.breadcrumbs[1]).toMatch(/Resume/i)
  })

  it('falls back to the workspace label for unknown routes', () => {
    const meta = getRouteMeta('/some-other-path')
    expect(meta.title).toBe('Career Workbench')
    expect(meta.sectionLabel).toBe('Workspace')
    expect(meta.topbarVariant).toBe('standard')
  })
})
