import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { describeStorageKey, readStorageInventory, type StorageKind } from '#/components/legal/storageCatalogue'

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

/**
 * Every storage key the app's code names must be explained on the Cookie Policy, or its live table labels the app's
 * own key "Not one of ours". This scans the source files that touch browser storage for key literals (exact keys and
 * template-literal prefixes) and checks each against the catalogue for the storage kind the file uses.
 */
describe('storage catalogue covers the code', () => {
  const src = path.resolve(__dirname, '../../..')
  const NOT_STORAGE = new Set(['cw:consent-change', 'cw:open-command-palette', 'cw:session-expired'])
  const KEY_LITERAL = /['"`]((?:cw[:-]|career-workbench:)[\w:-]*)(?:\$\{|['"`])/g

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full)
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
    })
  }

  const found: Array<{ file: string; key: string; kinds: StorageKind[] }> = []
  for (const file of sourceFiles(src)) {
    if (file.endsWith('storageCatalogue.ts')) continue
    const code = readFileSync(file, 'utf8')
    const usesLocal = /localStorage|writeStorageJson|readStorageJson|removeStorageValue/.test(code)
    const usesSession = /sessionStorage|SessionJson|removeSessionValue/.test(code)
    if (!usesLocal && !usesSession) continue
    const kinds: StorageKind[] = [...(usesLocal ? ['localStorage' as const] : []), ...(usesSession ? ['sessionStorage' as const] : [])]
    for (const match of code.matchAll(KEY_LITERAL)) {
      if (!NOT_STORAGE.has(match[1])) found.push({ file: path.relative(src, file), key: match[1], kinds })
    }
  }

  it('finds the keys it is meant to check', () => {
    expect(found.map((entry) => entry.key)).toEqual(expect.arrayContaining(['cw-cookie-consent', 'cw:dashboard-layout', 'cw:practice-rounds:']))
  })

  it('describes every key the code writes', () => {
    const unknown = found.filter(({ key, kinds }) =>
      kinds.every((kind) => /Not one of ours/.test(describeStorageKey(kind, `${key}x`).purpose) && /Not one of ours/.test(describeStorageKey(kind, key).purpose)),
    )
    expect(unknown.map(({ file, key }) => `${file}: ${key}`)).toEqual([])
  })

  it('files the new keys under the right storage and lifetime', () => {
    expect(describeStorageKey('localStorage', 'cw:dashboard-layout').lifetime).toBe('Until you clear it')
    expect(describeStorageKey('sessionStorage', 'cw:practice-rounds:run-1').purpose).toMatch(/practice/i)
    expect(describeStorageKey('sessionStorage', 'cw:profile-split').lifetime).toBe('Until you close the tab')
    expect(describeStorageKey('sessionStorage', 'cw:profile-empty').lifetime).toBe('Until you close the tab')
  })
})
