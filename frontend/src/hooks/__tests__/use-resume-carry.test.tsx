import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useResumeCarry } from '#/hooks/use-resume-carry'
import { RESUME_CARRY_TTL_MS } from '#/lib/tools/resumeCarryStore'

const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'
const UPDATED_AT_KEY = 'cw:resume-carry-updated-at'

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
  sessionStorage.removeItem(UPDATED_AT_KEY)
}

describe('useResumeCarry', () => {
  beforeEach(() => clearSession())
  afterEach(() => clearSession())

  it('reports no resume when sessionStorage is empty', () => {
    const { result } = renderHook(() => useResumeCarry())
    expect(result.current.resumeText).toBe('')
    expect(result.current.filename).toBe('')
    expect(result.current.hasResume).toBe(false)
  })

  it('setResumeText persists text and filename to sessionStorage', () => {
    const { result } = renderHook(() => useResumeCarry())
    act(() => {
      result.current.setResumeText('Hello resume', 'resume.pdf')
    })
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('Hello resume')
    expect(sessionStorage.getItem(FILENAME_KEY)).toBe('resume.pdf')
    expect(result.current.resumeText).toBe('Hello resume')
    expect(result.current.filename).toBe('resume.pdf')
    expect(result.current.hasResume).toBe(true)
  })

  it('clearResume removes the stored text and filename', () => {
    const { result } = renderHook(() => useResumeCarry())
    act(() => result.current.setResumeText('Some text', 'cv.pdf'))
    act(() => result.current.clearResume())
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(FILENAME_KEY)).toBeNull()
    expect(result.current.hasResume).toBe(false)
  })

  it('setResumeText with empty text clears the storage', () => {
    const { result } = renderHook(() => useResumeCarry())
    act(() => result.current.setResumeText('Initial', 'r.pdf'))
    act(() => result.current.setResumeText('', undefined))
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(FILENAME_KEY)).toBeNull()
  })

  it('returns a carried resume that is still inside the idle lifetime', () => {
    const first = renderHook(() => useResumeCarry())
    act(() => first.result.current.setResumeText('fresh resume', 'fresh.pdf'))
    sessionStorage.setItem(UPDATED_AT_KEY, String(Date.now() - (RESUME_CARRY_TTL_MS - 60_000)))

    const reopened = renderHook(() => useResumeCarry())

    expect(reopened.result.current.resumeText).toBe('fresh resume')
    expect(reopened.result.current.filename).toBe('fresh.pdf')
    expect(reopened.result.current.hasResume).toBe(true)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('fresh resume')
  })

  it('discards a carried resume older than the idle lifetime on the next read', () => {
    const first = renderHook(() => useResumeCarry())
    act(() => first.result.current.setResumeText('stale resume', 'stale.pdf'))
    sessionStorage.setItem(UPDATED_AT_KEY, String(Date.now() - (RESUME_CARRY_TTL_MS + 1)))

    const reopened = renderHook(() => useResumeCarry())

    expect(reopened.result.current.resumeText).toBe('')
    expect(reopened.result.current.filename).toBe('')
    expect(reopened.result.current.hasResume).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(FILENAME_KEY)).toBeNull()
    expect(sessionStorage.getItem(UPDATED_AT_KEY)).toBeNull()
  })

  it('discards an unstamped carried resume of unknown age', () => {
    sessionStorage.setItem(STORAGE_KEY, 'resume of unknown age')
    sessionStorage.setItem(FILENAME_KEY, 'unknown.pdf')

    const { result } = renderHook(() => useResumeCarry())

    expect(result.current.resumeText).toBe('')
    expect(result.current.hasResume).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(FILENAME_KEY)).toBeNull()
  })

  it('refreshes the lifetime stamp on every write', () => {
    const { result } = renderHook(() => useResumeCarry())
    act(() => result.current.setResumeText('first', 'first.pdf'))
    sessionStorage.setItem(UPDATED_AT_KEY, String(Date.now() - (RESUME_CARRY_TTL_MS - 1_000)))

    act(() => result.current.setResumeText('second', 'second.pdf'))

    const stamped = Number(sessionStorage.getItem(UPDATED_AT_KEY))
    expect(Date.now() - stamped).toBeLessThan(RESUME_CARRY_TTL_MS / 2)
    expect(result.current.resumeText).toBe('second')
  })

  it('notifies all subscribers when the resume changes', () => {
    const a = renderHook(() => useResumeCarry())
    const b = renderHook(() => useResumeCarry())
    act(() => a.result.current.setResumeText('shared', 'shared.pdf'))
    expect(b.result.current.resumeText).toBe('shared')
    expect(b.result.current.filename).toBe('shared.pdf')
  })
})
