import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useResumeCarry } from '#/hooks/use-resume-carry'

const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
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

  it('notifies all subscribers when the resume changes', () => {
    const a = renderHook(() => useResumeCarry())
    const b = renderHook(() => useResumeCarry())
    act(() => a.result.current.setResumeText('shared', 'shared.pdf'))
    expect(b.result.current.resumeText).toBe('shared')
    expect(b.result.current.filename).toBe('shared.pdf')
  })
})
