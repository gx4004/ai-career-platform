import { useEffect, useState } from 'react'

/**
 * `value`, delayed until it has stopped changing for `delayMs`. A change of `resetKey` (another document)
 * passes the new value through at once: it is not an edit in progress.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, resetKey = ''): T {
  const [state, setState] = useState({ key: resetKey, value })
  useEffect(() => {
    if (state.key !== resetKey) { setState({ key: resetKey, value }); return }
    if (Object.is(state.value, value)) return
    const timer = setTimeout(() => setState({ key: resetKey, value }), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs, resetKey, state])
  return state.key === resetKey ? state.value : value
}
