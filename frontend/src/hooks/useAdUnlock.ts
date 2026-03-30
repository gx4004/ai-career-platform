import { useState, useCallback } from 'react'

function isUnlockedInSession(runId: string | undefined): boolean {
  if (!runId) return false
  try {
    return sessionStorage.getItem(`ad-unlocked:${runId}`) === '1'
  } catch {
    return false
  }
}

function persistUnlock(runId: string | undefined) {
  if (!runId) return
  try {
    sessionStorage.setItem(`ad-unlocked:${runId}`, '1')
  } catch {
    // sessionStorage unavailable (e.g. private browsing)
  }
}

export function useAdUnlock(runId: string | undefined) {
  const [unlocked, setUnlocked] = useState(() => isUnlockedInSession(runId))

  const unlock = useCallback(() => {
    persistUnlock(runId)
    setUnlocked(true)
  }, [runId])

  return { unlocked, unlock }
}
