import { useSyncExternalStore } from 'react'

/**
 * The modifier key of the viewer's keyboard: "⌘" on Apple devices, "Ctrl" elsewhere. Every shortcut handler
 * accepts both (metaKey || ctrlKey); this only decides what the hints say. The server cannot know the device,
 * so it renders "⌘" and the client swaps the hint after hydration (useSyncExternalStore's server snapshot),
 * which keeps the first render identical on both sides.
 */
export type ModKey = '⌘' | 'Ctrl'

export function detectModKey(): ModKey {
  if (typeof navigator === 'undefined') return '⌘'
  // navigator.platform is the real OS even when the user agent string is overridden; userAgentData is the
  // newer source where platform is empty.
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = navigator.platform || uaData?.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl'
}

const noSubscribe = () => () => {}

export function useModKey(): ModKey {
  return useSyncExternalStore(noSubscribe, detectModKey, () => '⌘')
}

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export function shortcutLabel(mod: ModKey, key: string): string {
  return mod === '⌘' ? `⌘${key}` : `Ctrl ${key}`
}

/** The shortcut hint for `key` on this device ("⌘K" / "Ctrl K"). */
export function useShortcutLabel(key: string): string {
  return shortcutLabel(useModKey(), key)
}
