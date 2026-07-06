const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'

let listeners: Array<() => void> = []

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeToResumeCarry(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener)
  }
}

export function getResumeCarryText(): string {
  if (typeof sessionStorage === 'undefined') return ''
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

export function getResumeCarryFilename(): string {
  if (typeof sessionStorage === 'undefined') return ''
  return sessionStorage.getItem(FILENAME_KEY) ?? ''
}

export function setResumeCarry(text: string, name?: string): void {
  if (text) {
    sessionStorage.setItem(STORAGE_KEY, text)
    if (name) sessionStorage.setItem(FILENAME_KEY, name)
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(FILENAME_KEY)
  }
  emit()
}

export function clearResumeCarry(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(FILENAME_KEY)
  emit()
}
