import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { bumpOwnerGeneration } from '#/lib/auth/ownerGeneration'
import { useOwnerMutation } from '../useOwnerMutation'

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useOwnerMutation', () => {
  it('runs onSuccess when the owner is unchanged', async () => {
    const { queryClient, wrapper } = setup()
    const onSuccess = vi.fn((detail: { notes: string }) => queryClient.setQueryData(['applications', 'detail', 'a'], detail))
    const { result } = renderHook(
      () => useOwnerMutation({ mutationFn: async () => ({ notes: 'mine' }), onSuccess }),
      { wrapper },
    )
    await act(async () => { await result.current.mutateAsync() })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['applications', 'detail', 'a'])).toEqual({ notes: 'mine' })
  })

  it('drops a response that arrives after sign-out or an account change', async () => {
    const { queryClient, wrapper } = setup()
    let resolve!: (value: { notes: string }) => void
    const pending = new Promise<{ notes: string }>((r) => { resolve = r })
    const onSuccess = vi.fn((detail: { notes: string }) => queryClient.setQueryData(['applications', 'detail', 'a'], detail))
    const { result } = renderHook(
      () => useOwnerMutation({ mutationFn: () => pending, onSuccess }),
      { wrapper },
    )
    let settled: Promise<unknown> = Promise.resolve()
    act(() => { settled = result.current.mutateAsync().catch(() => undefined) })
    // Let the request actually start (the mutation function runs a few microtasks after mutate()).
    await act(async () => { await Promise.resolve() })
    // The session provider's purge: queries removed, mutation cache cleared, owner generation bumped.
    queryClient.removeQueries()
    queryClient.getMutationCache().clear()
    bumpOwnerGeneration()
    await act(async () => { resolve({ notes: 'PRIVATE PREVIOUS OWNER NOTES' }); await settled })
    expect(onSuccess).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(['applications', 'detail', 'a'])).toBeUndefined()
  })
})
