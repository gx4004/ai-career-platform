import { canUseDOM } from '#/lib/auth/storage'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme-mode'

export function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (!canUseDOM()) return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  return mode
}

export function buildThemeInitScript(): string {
  return `
    (function() {
      try {
        var mode = localStorage.getItem('${THEME_STORAGE_KEY}') || 'dark';
        var isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      } catch (e) {}
    })();
  `
}

export function getStoredThemeMode(): ThemeMode {
  if (!canUseDOM()) return 'dark'

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }

  return 'dark'
}
