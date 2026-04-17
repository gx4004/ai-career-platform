export function canUseDOM(): boolean {
  return typeof window !== 'undefined'
}

export function readStorageJson<T>(key: string): T | null {
  if (!canUseDOM()) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeStorageJson<T>(key: string, value: T): void {
  if (!canUseDOM()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function removeStorageValue(key: string): void {
  if (!canUseDOM()) return
  window.localStorage.removeItem(key)
}

export function readSessionJson<T>(key: string): T | null {
  if (!canUseDOM()) return null

  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeSessionJson<T>(key: string, value: T): void {
  if (!canUseDOM()) return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

export function removeSessionValue(key: string): void {
  if (!canUseDOM()) return
  window.sessionStorage.removeItem(key)
}
