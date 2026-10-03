import { Skeleton } from '#/components/kit'

/** The header's count line: a bar while loading, the count, or an empty line when the list failed, so the toolbar below never jumps. */
export function countMeta(count: string | null, loading: boolean) {
  if (count) return [count]
  return [
    loading ? (
      <Skeleton key="count" size="meta" width="3.5rem" />
    ) : (
      <span key="count" aria-hidden>
        {'\u00a0'}
      </span>
    ),
  ]
}
