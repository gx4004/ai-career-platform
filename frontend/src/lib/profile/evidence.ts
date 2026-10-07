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

export const KIND_SINGULAR_LABELS: Record<EvidenceKind, string> = {
  experience: 'Experience',
  achievement: 'Achievement',
  skill: 'Skill',
  education: 'Education',
  project: 'Project',
  certification: 'Certification',
  preference: 'Preference',
  'interview-evidence': 'Interview evidence',
}

// Kinds whose content is one value: the value is the card title and the
// field label ("Text", "Achievements") would only repeat the kind.
const SINGLE_FIELD_KINDS: ReadonlySet<EvidenceKind> = new Set(['skill', 'achievement'])

/**
 * A fact's card body. Single-field kinds return a title only (no field label);
 * multi-field kinds return labelled fields.
 */
export function factDisplay(item: EvidenceItem): {
  title: string | null
  fields: { key: string; label: string; value: string }[]
} {
  const entries = contentEntries(item.content)
  const filled = entries.filter((entry) => entry.value)
  if (SINGLE_FIELD_KINDS.has(item.kind) && filled.length === 1) {
    return { title: filled[0].value, fields: [] }
  }
  return {
    title: null,
    fields: entries.map(({ key, value }) => ({
      key,
      label: fieldLabel(key),
      value: value || '—',
    })),
  }
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

// One confirm for the one bulk erase (DELETE /evidence-profile/items), on /profile, Account and Settings alike. The
// confirm repeats the row's own words ("Delete profile"), and the description counts the facts that go, so it never
// reads like deleting the account.
export const PROFILE_PURGE_TITLE = 'Delete your profile?'
export const PROFILE_PURGE_CONFIRM = 'Delete profile'

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

/**
 * The field each hand-typed kind is keyed by, and its name. Add a fact, Edit and the rows all use it, so one field
 * never has two names (the edit dialog used to show the raw key, "Name", for the field Add a fact calls "Skill").
 * Interview evidence only comes from the Interview tool, so it has none.
 */
export const MAIN_FIELDS: Record<Exclude<EvidenceKind, 'interview-evidence'>, { field: string; fieldLabel: string }> = {
  skill: { field: 'name', fieldLabel: 'Skill' },
  experience: { field: 'title', fieldLabel: 'Role and employer' },
  achievement: { field: 'text', fieldLabel: 'What you achieved' },
  education: { field: 'degree', fieldLabel: 'Degree and school' },
  project: { field: 'name', fieldLabel: 'Project' },
  certification: { field: 'name', fieldLabel: 'Certification' },
  preference: { field: 'text', fieldLabel: 'What you are looking for' },
}

/** A content field's label on this fact: its kind's main field by its Add-a-fact name, any other field from its key. */
export function factFieldLabel(item: Pick<EvidenceItem, 'kind' | 'content'>, key: string): string {
  const main = item.kind === 'interview-evidence' ? null : MAIN_FIELDS[item.kind]
  if (!main || main.field !== key) return fieldLabel(key)
  // An imported role or degree keeps its employer or school in a field of its own, so the title is only the role.
  if (item.kind === 'experience' && 'company' in item.content) return 'Role'
  if (item.kind === 'education' && 'school' in item.content) return 'Degree'
  return main.fieldLabel
}

// Details that read on their own under a fact's first line: an employer, a school, the bullets of a role, the
// answer under an interview question. Any other field (a focus area, a level, a date) is named, "Focus area: …".
const SELF_EVIDENT_DETAILS: ReadonlySet<string> = new Set(['company', 'school', 'highlights', 'answer', 'text', 'description'])

/** One detail line under a fact's first value, labelled unless the value says what it is. */
export function factDetailLine(item: Pick<EvidenceItem, 'kind' | 'content'>, field: { key: string; value: string }): string {
  return SELF_EVIDENT_DETAILS.has(field.key) ? field.value : `${factFieldLabel(item, field.key)}: ${field.value}`
}

/** The API's limit on one value of a fact (backend MAX_CONTENT_VALUE_CHARS). */
export const MAX_FACT_VALUE_CHARS = 2000

/** "Up to 2,000 characters", then a live count once the text gets near the limit. */
export function factLengthHint(length: number, max = MAX_FACT_VALUE_CHARS): string {
  return length > max * 0.8
    ? `${length.toLocaleString('en-US')} of ${max.toLocaleString('en-US')} characters`
    : `Up to ${max.toLocaleString('en-US')} characters`
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
    if (edited.length > MAX_FACT_VALUE_CHARS) {
      return { ok: false, error: `Shorten ${fieldLabel(key).toLowerCase()} to ${MAX_FACT_VALUE_CHARS.toLocaleString('en-US')} characters.` }
    }
    const raw = content[key]
    next[key] = typeof raw !== 'string' && edited === original ? raw : edited
  }
  if (Object.keys(next).length === 0) {
    return { ok: false, error: 'Fill in at least one field.' }
  }
  return { ok: true, value: next }
}
