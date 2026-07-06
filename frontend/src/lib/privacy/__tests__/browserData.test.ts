import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('clearSensitiveBrowserData', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('clears career content while preserving consent and UI preferences', () => {
    sessionStorage.setItem(
      'career-workbench:draft:resume',
      JSON.stringify({ resumeText: 'private resume' }),
    )
    sessionStorage.setItem(
      'career-workbench:workflow-context',
      JSON.stringify({ jobDescription: 'private role' }),
    )
    sessionStorage.setItem(
      'cw:demo-result:resume-demo-123',
      JSON.stringify({ result_payload: { summary: 'private result' } }),
    )
    sessionStorage.setItem('cw:resume-carry', 'private carried resume')
    sessionStorage.setItem('cw:resume-carry-filename', 'resume.pdf')
    sessionStorage.setItem(
      'cw:practice-attempts',
      JSON.stringify({ 0: 2 }),
    )
    sessionStorage.setItem('cw:guest-banner-dismissed', '1')
    localStorage.setItem('cw-cookie-consent', 'accepted')
    localStorage.setItem('cw:onboarding', '{"completed":true}')

    clearSensitiveBrowserData()

    expect(sessionStorage.getItem('career-workbench:draft:resume')).toBeNull()
    expect(sessionStorage.getItem('career-workbench:workflow-context')).toBeNull()
    expect(sessionStorage.getItem('cw:demo-result:resume-demo-123')).toBeNull()
    expect(sessionStorage.getItem('cw:resume-carry')).toBeNull()
    expect(sessionStorage.getItem('cw:resume-carry-filename')).toBeNull()
    expect(sessionStorage.getItem('cw:practice-attempts')).not.toBeNull()
    expect(sessionStorage.getItem('cw:guest-banner-dismissed')).toBe('1')
    expect(localStorage.getItem('cw-cookie-consent')).toBe('accepted')
    expect(localStorage.getItem('cw:onboarding')).toBe('{"completed":true}')
  })

  it('continues clearing independent stores when one storage operation fails', () => {
    sessionStorage.setItem(
      'career-workbench:draft:resume',
      JSON.stringify({ resumeText: 'private resume' }),
    )
    sessionStorage.setItem(
      'career-workbench:workflow-context',
      JSON.stringify({ jobDescription: 'private role' }),
    )
    sessionStorage.setItem(
      'cw:demo-result:resume-demo-123',
      JSON.stringify({ result_payload: { summary: 'private result' } }),
    )
    sessionStorage.setItem('cw:resume-carry', 'private carried resume')
    const removeItem = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementationOnce(() => {
        throw new DOMException('storage denied')
      })

    expect(() => clearSensitiveBrowserData()).not.toThrow()
    expect(sessionStorage.getItem('career-workbench:workflow-context')).toBeNull()
    expect(sessionStorage.getItem('cw:demo-result:resume-demo-123')).toBeNull()
    expect(sessionStorage.getItem('cw:resume-carry')).toBeNull()

    removeItem.mockRestore()
  })
})
