/** localStorage key that stores the user's cookie-consent choice. */
export const CONSENT_STORAGE_KEY = 'cw-cookie-consent'

/** Fired on window in this tab whenever the stored choice is set or cleared (the storage event only reaches other tabs). */
const CONSENT_CHANGE_EVENT = 'cw:consent-change'

export type ConsentState = 'pending' | 'accepted' | 'rejected'

export function getStoredConsent(): ConsentState {
  if (typeof window === 'undefined') return 'pending'
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (stored === 'accepted' || stored === 'rejected') return stored
  } catch {
    /* private-mode Safari can throw */
  }
  return 'pending'
}

export function setStoredConsent(value: 'accepted' | 'rejected') {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
}

export function clearStoredConsent() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
}

/** Calls back whenever the stored choice changes, in this tab or another. Returns the unsubscribe function. */
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CONSENT_STORAGE_KEY) callback()
  }
  window.addEventListener(CONSENT_CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
  }
}

/** Read consent state without rendering the banner (for telemetry/ads gating). */
export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === 'accepted'
}
