import { useEffect, useState } from 'react'

const PREFIX = 'cw:reveal:'

function read(runId: string): boolean {
  try {
    return window.sessionStorage.getItem(PREFIX + runId) === '1'
  } catch {
    return false
  }
}

/**
 * Called by a tool mutation's success handler right before it navigates to the result: the next mount
 * of that run's result page plays the signature reveal (stamp, count-up, slaps) exactly once.
 */
export function markRevealPending(runId: string | number) {
  try {
    window.sessionStorage.setItem(PREFIX + String(runId), '1')
  } catch {
    // storage blocked (private window): the result simply renders in its final state
  }
}

function shouldReveal(key: string | null): boolean {
  if (key === null || typeof window === 'undefined') return false
  const pending = read(key)
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return pending && !reduced
}

/**
 * True on the one mount that follows markRevealPending(runId); every later visit, history open or
 * refresh gets false. The flag is read when the component first renders and cleared right after mount,
 * so a strict-mode double render or a re-render never loses or repeats it. Never true under reduced
 * motion (the flag is still consumed). Null or undefined run ids never reveal.
 */
export function useRevealOnce(runId: string | number | null | undefined): boolean {
  const key = runId === null || runId === undefined || runId === '' ? null : String(runId)
  const [state, setState] = useState(() => ({ key, value: shouldReveal(key) }))

  // A new run id (Re-generate navigates to a new result) re-reads the flag during render.
  let current = state
  if (state.key !== key) {
    current = { key, value: shouldReveal(key) }
    setState(current)
  }

  useEffect(() => {
    if (key === null) return
    try {
      window.sessionStorage.removeItem(PREFIX + key)
    } catch {
      // ignore
    }
  }, [key])

  return current.value
}
