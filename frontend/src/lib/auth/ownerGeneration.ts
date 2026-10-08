/**
 * A counter that moves every time owner-scoped client state is purged (sign-out, expiry, a different
 * account). A request started under one owner must not write its response, navigate or notify after the
 * counter has moved: `purgeOwnerScopedQueryData` clears queries and the mutation cache, but a mutation
 * already in flight still runs its `onSuccess`, which would put the previous owner's data back in the cache.
 */
let generation = 0

export function currentOwnerGeneration(): number {
  return generation
}

export function bumpOwnerGeneration(): void {
  generation += 1
}

export class OwnerChangedError extends Error {
  constructor() {
    super('The account changed before this request finished.')
    this.name = 'OwnerChangedError'
  }
}

/**
 * Wraps a mutation function so a response that arrives under a different owner is dropped: the mutation
 * rejects, so `onSuccess` (cache writes, navigation, toasts) never runs for the previous owner's data.
 */
export function ownerScoped<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    const started = generation
    const result = await fn(...args)
    if (started !== generation) throw new OwnerChangedError()
    return result
  }
}
