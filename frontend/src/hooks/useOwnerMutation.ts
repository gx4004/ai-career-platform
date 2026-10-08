import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query'
import { ownerScoped } from '#/lib/auth/ownerGeneration'

/**
 * `useMutation` for owner-scoped writes: a response that lands after sign-out or an account change is
 * dropped, so its `onSuccess` cannot put the previous owner's data back in the cache (see ownerGeneration).
 */
export function useOwnerMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { mutationFn } = options
  return useMutation({
    ...options,
    mutationFn: mutationFn ? ownerScoped(mutationFn as (v: TVariables) => Promise<TData>) : mutationFn,
  })
}
