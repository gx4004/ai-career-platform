import { useCallback, useSyncExternalStore } from 'react'
import {
  clearResumeCarry,
  getResumeCarryFilename,
  getResumeCarryText,
  setResumeCarry,
  subscribeToResumeCarry,
} from '#/lib/tools/resumeCarryStore'

export function useResumeCarry() {
  const resumeText = useSyncExternalStore(subscribeToResumeCarry, getResumeCarryText, () => '')
  const filename = useSyncExternalStore(subscribeToResumeCarry, getResumeCarryFilename, () => '')

  const setResumeText = useCallback((text: string, name?: string) => {
    setResumeCarry(text, name)
  }, [])

  const clearResume = useCallback(() => {
    clearResumeCarry()
  }, [])

  return {
    resumeText,
    filename,
    hasResume: resumeText.length > 0,
    setResumeText,
    clearResume,
  }
}
