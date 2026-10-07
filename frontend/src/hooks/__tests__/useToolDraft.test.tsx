import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useToolDraft } from '#/hooks/useToolDraft'
import { clearAllToolDrafts, getDraftKey, readToolDraft } from '#/lib/tools/drafts'

/**
 * The draft is written 300ms after the last change. Leaving the page sooner (typing, then clicking a sidebar link or
 * "Sign in to keep your results") used to cancel that write, so the edit was gone on return (sign-off tool-inputs-F28).
 */
describe('useToolDraft: keeps the last edit when the page goes away', () => {
  afterEach(() => sessionStorage.clear())

  it('writes a change made just before unmount', () => {
    const { result, unmount } = renderHook(() => useToolDraft('portfolio'))
    act(() => result.current.setField('targetRole', 'Staff Backend Engineer'))
    unmount()
    expect(readToolDraft('portfolio').targetRole).toBe('Staff Backend Engineer')
  })

  it('writes a change made just before the page is hidden (a full navigation)', () => {
    const { result, unmount } = renderHook(() => useToolDraft('cover-letter'))
    act(() => result.current.setField('tone', 'Warm'))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(readToolDraft('cover-letter').tone).toBe('Warm')
    unmount()
  })

  // Logging out clears every draft (they hold resume text); a write still waiting must not bring one back.
  it('does not bring a draft back after the drafts were cleared', () => {
    const { result, unmount } = renderHook(() => useToolDraft('job-match'))
    act(() => result.current.setField('jobDescription', 'A private job description'))
    clearAllToolDrafts()
    unmount()
    expect(sessionStorage.getItem(getDraftKey('job-match'))).toBeNull()
  })
})
