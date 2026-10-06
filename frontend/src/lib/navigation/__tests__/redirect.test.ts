import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '#/lib/navigation/redirect'

describe('safeInternalPath', () => {
  it.each([
    ['/discovery', '/discovery'],
    ['/campaigns?tab=saved', '/campaigns?tab=saved'],
    ['/cover-letter/result/abc-123#top', '/cover-letter/result/abc-123#top'],
    ['/', '/'],
  ])('keeps the in-app path %s', (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    'javascript:alert(1)',
    'discovery',
    '',
    '/path\nwith-newline',
    '/%2F%2Fevil.example',
    '/..//evil.example',
    '/.//evil.example',
    '/a/..//evil.example',
    '/%2e%2e//evil.example',
  ])('refuses %j', (input) => {
    expect(safeInternalPath(input)).toBeNull()
  })

  it('refuses things that are not strings', () => {
    expect(safeInternalPath(undefined)).toBeNull()
    expect(safeInternalPath(42)).toBeNull()
    expect(safeInternalPath({ to: '/x' })).toBeNull()
  })

  it('never sends the person back to the sign-in page itself', () => {
    expect(safeInternalPath('/login')).toBeNull()
    expect(safeInternalPath('/login?x=1')).toBeNull()
  })
})
