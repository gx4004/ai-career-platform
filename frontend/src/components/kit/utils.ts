import { useMemo, type MutableRefObject, type Ref } from 'react'

/** Assign a value to any kind of React ref (callback or object). */
export function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as MutableRefObject<T | null>).current = value
}

/** Combine several refs into one callback ref. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) setRef(ref, value)
  }
}

/** mergeRefs with a stable identity, so React does not detach and reattach the ref on every render. */
export function useMergedRef<T>(...refs: Array<Ref<T> | undefined>) {
  return useMemo(() => mergeRefs(...refs), refs)
}
