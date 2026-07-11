import type {
  EvidenceConfirmationState,
  EvidenceItem,
  EvidenceKind,
  EvidenceProvenance,
} from '#/lib/api/schemas'

// Canonical display order for the eight evidence kinds (ADR 0005, D-061).
export const KIND_ORDER: readonly EvidenceKind[] = [
  'experience',
  'achievement',
  'skill',
  'education',
  'project',
  'certification',
  'preference',
  'interview-evidence',
]

export const KIND_LABELS: Record<EvidenceKind, string> = {
  experience: 'Experience',
  achievement: 'Achievements',
  skill: 'Skills',
  education: 'Education',
  project: 'Projects',
  certification: 'Certifications',
  preference: 'Preferences',
  'interview-evidence': 'Interview evidence',
}

// Provenance is a factual origin label; it never implies the user vouched for it.
export const PROVENANCE_LABELS: Record<EvidenceProvenance, string> = {
  imported: 'Imported',
  inferred: 'Inferred',
  'user-entered': 'You entered',
}

export const PROVENANCE_DESCRIPTIONS: Record<EvidenceProvenance, string> = {
  imported: 'Extracted from a resume you uploaded.',
  inferred: 'Suggested by a tool from your inputs.',
  'user-entered': 'Added by you directly.',
}

export const STATE_LABELS: Record<EvidenceConfirmationState, string> = {
  unconfirmed: 'Unconfirmed',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
}

export type EvidenceGroup = {
  kind: EvidenceKind
  label: string
  items: EvidenceItem[]
}

/**
 * Group items by kind in the canonical order, dropping kinds with no items.
 * Item order within a group is preserved from the input (backend returns
 * created_at ascending).
 */
export function groupItemsByKind(items: EvidenceItem[]): EvidenceGroup[] {
  const byKind = new Map<EvidenceKind, EvidenceItem[]>()
  for (const item of items) {
    const bucket = byKind.get(item.kind)
    if (bucket) bucket.push(item)
    else byKind.set(item.kind, [item])
  }
  return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    items: byKind.get(kind) ?? [],
  }))
}

export type TrustCounts = {
  total: number
  confirmed: number
  unconfirmed: number
  rejected: number
}

export function countByState(items: EvidenceItem[]): TrustCounts {
  const counts: TrustCounts = { total: 0, confirmed: 0, unconfirmed: 0, rejected: 0 }
  for (const item of items) {
    counts.total += 1
    counts[item.confirmation_state] += 1
  }
  return counts
}

/**
 * Render a freeform content record as a short, human-readable preview.
 * Content is an arbitrary JSON object (Record<string, unknown>), so values are
 * coerced defensively; objects/arrays are JSON-encoded.
 */
export function contentEntries(
  content: Record<string, unknown>,
): { key: string; value: string }[] {
  return Object.entries(content).map(([key, value]) => ({
    key,
    value: stringifyValue(value),
  }))
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Pretty-print content for the correction editor. */
export function contentToEditableText(content: Record<string, unknown>): string {
  return JSON.stringify(content, null, 2)
}

export type ParsedContent =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Parse the correction editor text back into a content record. Enforces the
 * same shape the backend requires: a non-empty JSON object (D-061 content is a
 * typed record, never a bare scalar or array).
 */
export function parseEditableText(text: string): ParsedContent {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Content cannot be empty.' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'Content must be valid JSON.' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Content must be a JSON object of fields.' }
  }
  const record = parsed as Record<string, unknown>
  if (Object.keys(record).length === 0) {
    return { ok: false, error: 'Content must contain at least one field.' }
  }
  return { ok: true, value: record }
}
