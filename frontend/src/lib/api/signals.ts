/**
 * AbortSignal.any and AbortSignal.timeout with fallbacks for browsers that lack them (Safari before 17.4,
 * which is every iPhone on iOS 16). Calling a missing one throws a TypeError before fetch() even starts.
 */

/** A signal that aborts after `ms` with a TimeoutError, as AbortSignal.timeout does. */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms)
  return controller.signal
}

/** A signal that aborts, with the same reason, as soon as any of `signals` does, as AbortSignal.any does. */
export function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)
  const controller = new AbortController()
  const already = signals.find((signal) => signal.aborted)
  if (already) {
    controller.abort(already.reason)
    return controller.signal
  }
  const cleanup = () => {
    for (const signal of signals) signal.removeEventListener('abort', onAbort)
  }
  function onAbort(this: AbortSignal) {
    cleanup()
    controller.abort(this.reason)
  }
  for (const signal of signals) signal.addEventListener('abort', onAbort)
  return controller.signal
}
