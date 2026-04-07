/** localStorage key that stores the user's cookie-consent choice. */
export const CONSENT_STORAGE_KEY = 'cw-cookie-consent'

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
}

export function clearStoredConsent() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Read consent state without rendering the banner (for telemetry/ads gating). */
export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === 'accepted'
}
