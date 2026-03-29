import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'cw:resume-carry'
const FILENAME_KEY = 'cw:resume-carry-filename'

let listeners: Array<() => void> = []

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

function getSnapshot(): string {
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

function getFilenameSnapshot(): string {
  return sessionStorage.getItem(FILENAME_KEY) ?? ''
}

export function useResumeCarry() {
  const resumeText = useSyncExternalStore(subscribe, getSnapshot, () => '')
  const filename = useSyncExternalStore(subscribe, getFilenameSnapshot, () => '')

  const setResumeText = useCallback((text: string, name?: string) => {
    if (text) {
      sessionStorage.setItem(STORAGE_KEY, text)
      if (name) sessionStorage.setItem(FILENAME_KEY, name)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(FILENAME_KEY)
    }
    emit()
  }, [])

  const clearResume = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(FILENAME_KEY)
    emit()
  }, [])

  return {
    resumeText,
    filename,
    hasResume: resumeText.length > 0,
    setResumeText,
    clearResume,
  }
}
