import type { CSSProperties } from 'react'

export function toolAccentStyle(accent: string | undefined): CSSProperties {
  return { '--tool-accent': accent } as CSSProperties
}
