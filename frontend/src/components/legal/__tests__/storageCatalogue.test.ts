import { afterEach, describe, expect, it } from 'vitest'
import { describeStorageKey, readStorageInventory } from '#/components/legal/storageCatalogue'

describe('storage catalogue', () => {
  afterEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('explains the keys the app really writes, by exact name or prefix', () => {
    expect(describeStorageKey('localStorage', 'cw-cookie-consent').purpose).toMatch(/cookie-consent/)
    expect(describeStorageKey('sessionStorage', 'cw:reveal:abc').purpose).toMatch(/stamp/)
    expect(describeStorageKey('sessionStorage', 'career-workbench:draft:resume').purpose).toMatch(/form/)
    expect(describeStorageKey('Cookie', 'sidebar_state').lifetime).toBe('7 days')
  })

  it('marks a key it does not know instead of hiding it', () => {
    expect(describeStorageKey('localStorage', 'mystery').purpose).toMatch(/Not one of ours/)
  })

  it('lists what the browser holds right now, never the values', () => {
    window.localStorage.setItem('cw-cookie-consent', 'accepted')
    window.sessionStorage.setItem('cw:resume-carry', 'secret resume text')
    const inventory = readStorageInventory()
    expect(inventory.map((entry) => entry.name)).toEqual(expect.arrayContaining(['cw-cookie-consent', 'cw:resume-carry']))
    expect(JSON.stringify(inventory)).not.toContain('secret resume text')
  })
})
