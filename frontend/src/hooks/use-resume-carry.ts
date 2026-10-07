import { useCallback, useSyncExternalStore } from 'react'
import {
  clearResumeCarry,
  getResumeCarryFilename,
  getResumeCarryOrigin,
  getResumeCarryText,
  setResumeCarry,
  subscribeToResumeCarry,
} from '#/lib/tools/resumeCarryStore'

export function useResumeCarry() {
  const resumeText = useSyncExternalStore(subscribeToResumeCarry, getResumeCarryText, () => '')
  const filename = useSyncExternalStore(subscribeToResumeCarry, getResumeCarryFilename, () => '')
  const origin = useSyncExternalStore(subscribeToResumeCarry, getResumeCarryOrigin, () => '')

  const setResumeText = useCallback((text: string, name?: string) => {
    setResumeCarry(text, name)
  }, [])

  const clearResume = useCallback(() => {
    clearResumeCarry()
  }, [])

  return {
    resumeText,
    filename,
    origin,
    hasResume: resumeText.length > 0,
    setResumeText,
    clearResume,
  }
}
