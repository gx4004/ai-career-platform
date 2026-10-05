/**
 * What Career Workbench keeps in the browser, by the real storage keys the code writes. The cookie page lists
 * what this browser holds right now and explains each key from this table; a key not found here is shown
 * as unrecognised rather than hidden. Keep it in step with the keys in lib/ and hooks/.
 */

export type StorageKind = 'localStorage' | 'sessionStorage' | 'Cookie'

export type StorageEntry = { name: string; kind: StorageKind; purpose: string; lifetime: string }

type Rule = { kind: StorageKind; match: string | RegExp; purpose: string; lifetime: string }

const TAB = 'Until you close the tab'

const RULES: Rule[] = [
  { kind: 'localStorage', match: 'cw-cookie-consent', purpose: 'Remembers your cookie-consent choice.', lifetime: 'Until you clear it' },
  { kind: 'localStorage', match: 'cw:onboarding', purpose: 'Remembers which first-run tips you have seen.', lifetime: 'Until you clear it' },
  { kind: 'localStorage', match: 'app_language', purpose: 'The interface language (English only for now).', lifetime: 'Until you clear it' },
  {
    kind: 'localStorage',
    match: 'career-workbench:pending-intent',
    purpose: 'Where to send you after you sign in.',
    lifetime: 'Ignored after 10 minutes',
  },
  { kind: 'sessionStorage', match: /^tsr-scroll-restoration/, purpose: 'Remembers how far you had scrolled, so Back returns you to the same spot.', lifetime: TAB },
  { kind: 'sessionStorage', match: /^cw:resume-carry/, purpose: 'Your resume text, carried between tools in this tab.', lifetime: TAB },
  { kind: 'sessionStorage', match: 'career-workbench:workflow-context', purpose: 'The resume and job carried between tools in this tab.', lifetime: TAB },
  { kind: 'sessionStorage', match: /^career-workbench:draft:/, purpose: 'An unsent tool form, so a reload does not lose it.', lifetime: TAB },
  { kind: 'sessionStorage', match: /^cw:reveal:/, purpose: 'Marks a new result so its stamp plays once.', lifetime: TAB },
  { kind: 'sessionStorage', match: /^cw:letter-edit:/, purpose: 'Your edits to a cover letter.', lifetime: TAB },
  { kind: 'sessionStorage', match: /^cw:practice:/, purpose: 'Your interview practice attempts.', lifetime: TAB },
  { kind: 'sessionStorage', match: 'cw:guest-banner-dismissed', purpose: 'Remembers you closed the save-your-work reminder.', lifetime: TAB },
  { kind: 'sessionStorage', match: 'cw:consecutive-crashes', purpose: 'Counts page crashes so a repeat one returns you to the dashboard.', lifetime: TAB },
  { kind: 'sessionStorage', match: 'cw:sw-reload-pending', purpose: 'Technical flag used to reload the page after an update.', lifetime: TAB },
  { kind: 'Cookie', match: 'sidebar_state', purpose: 'Remembers whether the sidebar is open.', lifetime: '7 days' },
]

export function describeStorageKey(kind: StorageKind, name: string): StorageEntry {
  const rule = RULES.find((entry) => entry.kind === kind && (typeof entry.match === 'string' ? entry.match === name : entry.match.test(name)))
  return rule
    ? { name, kind, purpose: rule.purpose, lifetime: rule.lifetime }
    : { name, kind, purpose: 'Not one of ours: set by the browser, an extension or another page on this address.', lifetime: 'Unknown' }
}

function keysOf(storage: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key) keys.push(key)
  }
  return keys
}

/** Everything this browser holds for this address that JavaScript can see (HttpOnly sign-in cookies cannot be read, and are listed above). */
export function readStorageInventory(): StorageEntry[] {
  if (typeof window === 'undefined') return []
  const entries: StorageEntry[] = []
  try {
    for (const key of keysOf(window.localStorage)) entries.push(describeStorageKey('localStorage', key))
  } catch {
    /* storage blocked */
  }
  try {
    for (const key of keysOf(window.sessionStorage)) entries.push(describeStorageKey('sessionStorage', key))
  } catch {
    /* storage blocked */
  }
  try {
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim()
      if (name) entries.push(describeStorageKey('Cookie', name))
    }
  } catch {
    /* cookies blocked */
  }
  return entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
}
