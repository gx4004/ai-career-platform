import { useMemo, useSyncExternalStore } from 'react'

/** Which of the dashboard's two main sections comes first: Needs action when something needs you, else Best matches. */
export type TodayOrder = 'needs-first' | 'matches-first'

/** How the signed-in dashboard last settled in this browser, so its loading frames are drawn in the same places. */
export type DashboardLayoutHint = { order: TodayOrder; firstSteps: boolean }

const KEY = 'cw:dashboard-layout'

const noSubscription = () => () => {}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): DashboardLayoutHint | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<DashboardLayoutHint>
    if (value.order !== 'needs-first' && value.order !== 'matches-first') return null
    return { order: value.order, firstSteps: value.firstSteps === true }
  } catch {
    return null
  }
}

/** Called once the page has settled on what it shows. A blocked storage only costs the next load its guess. */
export function rememberDashboardLayout(hint: DashboardLayoutHint): void {
  try {
    const raw = JSON.stringify(hint)
    if (window.localStorage.getItem(KEY) !== raw) window.localStorage.setItem(KEY, raw)
  } catch {
    // ignore
  }
}

/**
 * The last settled layout, or null when none is known. Null on the server and in the hydration render (the server
 * cannot read localStorage), so the first client render matches the server's HTML.
 */
export function useDashboardLayoutHint(): DashboardLayoutHint | null {
  const raw = useSyncExternalStore(noSubscription, readRaw, () => null)
  return useMemo(() => parse(raw), [raw])
}
