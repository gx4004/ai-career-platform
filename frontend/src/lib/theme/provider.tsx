import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { canUseDOM } from '#/lib/auth/storage'
import {
  getStoredThemeMode,
  resolveThemeMode,
  THEME_STORAGE_KEY,
} from '#/lib/theme/theme'

type ThemeContextValue = {
  mode: 'light' | 'dark' | 'system'
  resolvedMode: 'light' | 'dark'
  setMode: (mode: 'light' | 'dark' | 'system') => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>(() =>
    getStoredThemeMode(),
  )
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() =>
    resolveThemeMode(getStoredThemeMode()),
  )

  useEffect(() => {
    if (!canUseDOM()) return

    const applyTheme = () => {
      const nextResolved = resolveThemeMode(mode)
      document.documentElement.classList.toggle('dark', nextResolved === 'dark')
      window.localStorage.setItem(THEME_STORAGE_KEY, mode)
      setResolvedMode(nextResolved)
    }

    applyTheme()

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (mode === 'system') {
        applyTheme()
      }
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [mode])

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode,
    }),
    [mode, resolvedMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeContext() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider')
  }

  return context
}
