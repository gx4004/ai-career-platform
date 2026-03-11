import { useState, useCallback } from 'react'

const ONBOARDING_KEY = 'cw:onboarding'

type OnboardingState = {
  completed: boolean
  completedAt: number | null
  skippedAt: number | null
}

function readState(): OnboardingState {
  if (typeof window === 'undefined') return { completed: false, completedAt: null, skippedAt: null }
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (!raw) return { completed: false, completedAt: null, skippedAt: null }
    return JSON.parse(raw) as OnboardingState
  } catch {
    return { completed: false, completedAt: null, skippedAt: null }
  }
}

function writeState(state: OnboardingState): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state))
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(readState)
  const [open, setOpen] = useState(false)

  const complete = useCallback(() => {
    const next: OnboardingState = { completed: true, completedAt: Date.now(), skippedAt: null }
    writeState(next)
    setState(next)
    setOpen(false)
  }, [])

  const skip = useCallback(() => {
    const next: OnboardingState = { completed: true, completedAt: null, skippedAt: Date.now() }
    writeState(next)
    setState(next)
    setOpen(false)
  }, [])

  const reset = useCallback(() => {
    const next: OnboardingState = { completed: false, completedAt: null, skippedAt: null }
    writeState(next)
    setState(next)
  }, [])

  const shouldShow = !state.completed

  const startTour = useCallback(() => {
    setOpen(true)
  }, [])

  return {
    ...state,
    open,
    shouldShow,
    startTour,
    complete,
    skip,
    reset,
    setOpen,
  }
}

export function isOnboardingComplete(): boolean {
  return readState().completed
}

export function clearOnboarding(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ONBOARDING_KEY)
}
