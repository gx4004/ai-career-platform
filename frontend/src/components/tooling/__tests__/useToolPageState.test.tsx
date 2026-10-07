import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolPageState } from '#/components/tooling/toolPageShared'

const mutateMock = vi.hoisted(() => vi.fn())

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'guest', openAuthDialog: vi.fn() }),
}))

vi.mock('#/hooks/useToolMutation', () => ({
  useToolMutation: () => ({ mutate: mutateMock, cancel: vi.fn(), isPending: false, error: null }),
}))

describe('useToolPageState', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mutateMock.mockReset()
  })

  // A field's error is about what it held at submit: once the user changes it, the error must not contradict the field.
  it('clears a field’s validation error as soon as that field changes, and keeps the others', () => {
    const { result } = renderHook(() => useToolPageState('job-match'))

    act(() => result.current.handleSubmit())
    expect(result.current.errors.resumeText).toBeTruthy()
    expect(result.current.errors.jobDescription).toBeTruthy()
    expect(mutateMock).not.toHaveBeenCalled()

    act(() => result.current.setField('resumeText', 'Backend engineer, five years of Python and PostgreSQL.'))
    expect(result.current.errors.resumeText).toBeUndefined()
    expect(result.current.draft.resumeText).toBe('Backend engineer, five years of Python and PostgreSQL.')
    // Only the field that changed loses its error.
    expect(result.current.errors.jobDescription).toBeTruthy()

    act(() => result.current.setField('jobDescription', 'Senior Backend Engineer at Northwind Labs.'))
    expect(result.current.errors.jobDescription).toBeUndefined()
  })
})
