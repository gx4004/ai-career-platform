import type { CvHeader } from '#/lib/api/schemas'

/** The header of a CV with nothing set: the paper then opens with the document's own name, as it always did. */
export const EMPTY_HEADER: CvHeader = { name: null, headline: null, email: null, phone: null, location: null, links: [] }

export const MAX_HEADER_LINKS = 6

/** Same whitespace rule as the renderer's `_clean`: collapse runs, blank means unset. */
const clean = (value: string | null | undefined) => {
  const text = (value ?? '').split(/\s+/).filter(Boolean).join(' ')
  return text || null
}

/** The renderer's `URL_RE`: only text that matches is drawn as a link in the PDF. */
const URL_RE = /https?:\/\/[^\s<>()[\]{}"']*[^\s<>()[\]{}"'.,;:!?]/g

export type PaperHeader = { title: string; headline: string | null; contact: string[] }

/**
 * What the paper shows above the sections, shaped exactly like the exports
 * (`_render_header`): the candidate's name, or the document name when none was set;
 * the headline; then email, phone, location and links, in that order.
 */
export function buildPaperHeader(header: CvHeader | undefined, documentName: string): PaperHeader {
  const raw = header ?? EMPTY_HEADER
  const contact = [clean(raw.email), clean(raw.phone), clean(raw.location), ...(raw.links ?? []).map(clean)]
    .filter((item): item is string => Boolean(item))
  return {
    title: clean(raw.name) ?? (documentName.trim() || 'Untitled CV'),
    headline: clean(raw.headline),
    contact,
  }
}

export type TextPart = { text: string; link: boolean }

/** Splits a contact item into plain and link parts: the PDF draws the link parts blue. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let cursor = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0
    if (start > cursor) parts.push({ text: text.slice(cursor, start), link: false })
    parts.push({ text: match[0], link: true })
    cursor = start + match[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), link: false })
  return parts
}

/** The header as the API stores it: blank fields become null, links are trimmed and capped. */
export function toSavableHeader(header: CvHeader | undefined): CvHeader {
  const raw = header ?? EMPTY_HEADER
  const field = (value: string | null | undefined) => (value ?? '').trim() || null
  return {
    name: field(raw.name),
    headline: field(raw.headline),
    email: field(raw.email),
    phone: field(raw.phone),
    location: field(raw.location),
    links: (raw.links ?? []).map((link) => link.trim()).filter(Boolean).slice(0, MAX_HEADER_LINKS),
  }
}

/** A short line for the Header row in the Sections list. */
export function describeHeader(header: CvHeader | undefined, documentName: string): string {
  const shown = buildPaperHeader(header, documentName)
  const details = [shown.headline, ...shown.contact].filter(Boolean).length
  if (details === 0) return clean(header?.name) ? 'Name only' : 'Add your name and contact details'
  return `${details} ${details === 1 ? 'detail' : 'details'}`
}
