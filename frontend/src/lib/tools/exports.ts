import { requestBlob } from '#/lib/api/client'

type AnyObject = Record<string, unknown>

export type ExportableSection = {
  id: string
  title: string
  body?: string | null
  items: string[]
}

export type EditableBlock = {
  id: string
  label: string
  content: string
  placeholder?: string | null
}

export type ExportFormat = 'txt' | 'md' | 'pdf'

export function readExportableSections(payload: AnyObject): ExportableSection[] {
  if (!Array.isArray(payload.exportable_sections)) return []
  return payload.exportable_sections
    .filter((item): item is AnyObject => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      id: toString(item.id) || `section-${index + 1}`,
      title: toString(item.title) || `Section ${index + 1}`,
      body: toString(item.body) || null,
      items: toStringArray(item.items),
    }))
    .filter((item) => item.body || item.items.length > 0)
}

export function readEditableBlocks(payload: AnyObject): EditableBlock[] {
  if (!Array.isArray(payload.editable_blocks)) return []
  return payload.editable_blocks
    .filter((item): item is AnyObject => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      id: toString(item.id) || `editable-${index + 1}`,
      label: toString(item.label) || `Editable block ${index + 1}`,
      content: toString(item.content),
      placeholder: toString(item.placeholder) || null,
    }))
    .filter((item) => item.content)
}

export function formatExportContent(
  sections: ExportableSection[],
  format: ExportFormat,
): string {
  if (format === 'md') {
    return sections
      .map((section) =>
        [
          `## ${section.title}`,
          section.body || '',
          ...section.items.map((item) => `- ${item}`),
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
      .filter(Boolean)
      .join('\n\n')
  }

  return sections
    .map((section) =>
      [
        section.title.toUpperCase(),
        section.body || '',
        ...section.items.map((item) => `- ${item}`),
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n')
}

const MAX_NAME_LENGTH = 80

export function sanitizeDownloadTitle(title: string, format: ExportFormat): string {
  const fallback = format === 'md' ? 'career-workbench-export.md' : 'career-workbench-export.txt'
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!cleaned) return fallback
  return `${cleaned.slice(0, MAX_NAME_LENGTH).replace(/-+$/, '')}.${format}`
}

/**
 * A file name that is safe to hand to `a.download`: no path separators, quotes, reserved or
 * control characters, no trailing dots, at most 80 characters before the extension.
 * Returns '' when nothing usable is left, so callers can fall back.
 */
export function safeFileName(name: string, extension?: string): string {
  const ext = extension ? `.${extension.replace(/^\./, '')}` : ''
  let base = name
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/:*?"'`<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length)
  base = base.slice(0, MAX_NAME_LENGTH).replace(/[. ]+$/g, '').replace(/^[. ]+/g, '')
  return base ? `${base}${ext}` : ''
}

export async function exportPdf(historyId: string): Promise<void> {
  // Same session rules as every other request: a lapsed access token is refreshed and retried, not a sign-out.
  const { blob, filename } = await requestBlob(`/history/${encodeURIComponent(historyId)}/export/pdf`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFileName(filename ?? '', 'pdf') || `result-${historyId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function toString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toString(item))
    .filter(Boolean)
}
