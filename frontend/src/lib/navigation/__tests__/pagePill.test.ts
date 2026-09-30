import { describe, expect, it } from 'vitest'
import { getNavDestination } from '#/lib/navigation/navGroups'
import { getPagePill } from '#/lib/navigation/pagePill'

describe('getPagePill', () => {
  it('uses the sidebar icon and label for grouped destinations', () => {
    for (const route of ['/discovery', '/campaigns', '/cv-studio', '/profile', '/history']) {
      const destination = getNavDestination(route)
      expect(getPagePill(route)).toEqual({ icon: destination.icon, label: destination.label })
    }
  })

  it('resolves sub-paths to their parent destination', () => {
    expect(getPagePill('/campaigns/abc')?.label).toBe('Applications')
  })

  it('does not match on a shared prefix', () => {
    expect(getPagePill('/campaigns-old')).toBeNull()
    expect(getPagePill('/resume')).toBeNull()
  })

  it('covers account and settings', () => {
    expect(getPagePill('/account')?.label).toBe('Account')
    expect(getPagePill('/settings')?.label).toBe('Settings')
  })
})
