import {
  evidenceKindSchema,
  type EvidenceConfirmationState,
  type EvidenceItem,
  type EvidenceKind,
  type EvidenceProvenance,
} from '#/lib/api/schemas'
export { EVIDENCE_QUERY_KEY } from '#/lib/query/evidenceCaches'

// Display order for the eight evidence kinds is the schema's own order
// (ADR 0005, D-061), so the kind list lives in one place.
export const KIND_ORDER: readonly EvidenceKind[] = evidenceKindSchema.options

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

// Source is a factual origin label; it never implies the user vouched for it.
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
  unconfirmed: 'Suggested',
  confirmed: 'Saved',
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
}

export function countByState(items: EvidenceItem[]): TrustCounts {
  const counts: TrustCounts = { total: 0, confirmed: 0, unconfirmed: 0 }
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

/** "start_date" / "startDate" → "Start date": a readable label for a content key. */
export function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : key
}

export type FieldEdit =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Fold the edit dialog's per-field text back into a content record. A cleared
 * field is dropped; a non-text value the owner left untouched keeps its
 * original shape. The backend requires at least one field (D-061).
 */
export function applyFieldEdits(
  content: Record<string, unknown>,
  values: Record<string, string>,
): FieldEdit {
  const next: Record<string, unknown> = {}
  for (const { key, value: original } of contentEntries(content)) {
    const edited = (values[key] ?? original).trim()
    if (!edited) continue
    const raw = content[key]
    next[key] = typeof raw !== 'string' && edited === original ? raw : edited
  }
  if (Object.keys(next).length === 0) {
    return { ok: false, error: 'Fill in at least one field.' }
  }
  return { ok: true, value: next }
}
