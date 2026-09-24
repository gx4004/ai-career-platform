export interface StaticPage {
  name: string
  path: string
  auth: 'guest' | 'user' | 'admin'
}

export const STATIC_PAGES: StaticPage[]

export const VIEWPORTS: {
  desktop: { width: number; height: number }
  mobile: { width: number; height: number }
}

export function outputPath(baseDir: string, viewport: string, name: string): string

export interface CaptureResultLike {
  name: string
  viewport: string
  status: 'captured' | 'failed' | 'skipped'
  path?: string
  error?: string
}

export interface ScreenshotSummary {
  generatedAt: string
  total: number
  capturedCount: number
  failedCount: number
  skippedCount: number
  captured: Array<{ name: string; viewport: string; path?: string }>
  failed: Array<{ name: string; viewport: string; error?: string }>
  skipped: Array<{ name: string; viewport: string; error?: string }>
}

export function buildSummary(results: CaptureResultLike[]): ScreenshotSummary
