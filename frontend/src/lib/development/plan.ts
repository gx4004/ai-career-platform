import type {
  DevelopmentItem,
  DevelopmentResponseKind,
  DevelopmentState,
} from '#/lib/api/developmentSchemas'
import type { GapKind } from '#/lib/api/gapClassificationSchemas'
import type { GapCommercialRelationship } from '#/lib/api/gapResponseSchemas'

// R17 #199 development-plan presentation helpers. Mirrors lib/profile/evidence.ts:
// stable label maps, a grouping that preserves canonical order, and per-state
// counts. Items are grouped by response_kind (a stable derived property) rather
// than by state, so an item never jumps groups when the user advances it.

export const STATE_ORDER: readonly DevelopmentState[] = [
  'planned',
  'in_progress',
  'completed',
]

export const STATE_LABELS: Record<DevelopmentState, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
}

// Canonical display order for the four honest responses to a classified gap.
export const RESPONSE_KIND_ORDER: readonly DevelopmentResponseKind[] = [
  'reword',
  'capture_evidence',
  'produce_evidence',
  'learn_skill',
]

export const RESPONSE_KIND_LABELS: Record<DevelopmentResponseKind, string> = {
  reword: 'Reword existing content',
  capture_evidence: 'Capture existing evidence',
  produce_evidence: 'Produce new evidence',
  learn_skill: 'Learn a new skill',
}

export const RESPONSE_KIND_DESCRIPTIONS: Record<DevelopmentResponseKind, string> = {
  reword: 'You already have the substance — sharpen how it reads.',
  capture_evidence: 'The proof already exists; record it in your profile.',
  produce_evidence: 'The work is real but not yet demonstrable — create an artifact.',
  learn_skill: 'A genuine skill gap — plan the learning that closes it.',
}

// D-111 requires the commercial relationship behind a recommendation to be
// disclosed. Keying the label map on the schema-derived union means widening
// `commercial_relationship` server-side is a compile error here rather than a
// UI that keeps asserting the old, now-false disclosure.
export const COMMERCIAL_RELATIONSHIP_LABELS: Record<GapCommercialRelationship, string> = {
  none: 'None disclosed',
}

/** The disclosure to render for `value`, never a claim we cannot substantiate. */
export function commercialRelationshipLabel(value: string): string {
  return (
    COMMERCIAL_RELATIONSHIP_LABELS[value as GapCommercialRelationship] ??
    // An unrecognised relationship must never render as "None disclosed":
    // showing the raw value is honest, silently under-disclosing is not.
    value
  )
}

export const GAP_KIND_LABELS: Record<GapKind, string> = {
  presentation_weakness: 'Presentation weakness',
  uncaptured_evidence: 'Uncaptured evidence',
  evidence_not_yet_produced: 'Evidence not yet produced',
  missing_skill: 'Missing skill',
}

export type DevelopmentGroup = {
  responseKind: DevelopmentResponseKind
  label: string
  description: string
  items: DevelopmentItem[]
}

/**
 * Group items by response_kind in the canonical order, dropping kinds with no
 * items. Item order within a group is preserved from the input (the backend
 * returns items in a stable order).
 */
export function groupItemsByResponseKind(items: DevelopmentItem[]): DevelopmentGroup[] {
  const byKind = new Map<DevelopmentResponseKind, DevelopmentItem[]>()
  for (const item of items) {
    const bucket = byKind.get(item.response_kind)
    if (bucket) bucket.push(item)
    else byKind.set(item.response_kind, [item])
  }
  return RESPONSE_KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    responseKind: kind,
    label: RESPONSE_KIND_LABELS[kind],
    description: RESPONSE_KIND_DESCRIPTIONS[kind],
    items: byKind.get(kind) ?? [],
  }))
}

export type StateCounts = {
  total: number
  planned: number
  in_progress: number
  completed: number
}

export function countByState(items: DevelopmentItem[]): StateCounts {
  const counts: StateCounts = { total: 0, planned: 0, in_progress: 0, completed: 0 }
  for (const item of items) {
    counts.total += 1
    counts[item.state] += 1
  }
  return counts
}

/**
 * Normalize a nullable ISO target date to the `YYYY-MM-DD` value an
 * `<input type="date">` expects. Returns '' for a cleared date.
 */
export function toDateInputValue(target: string | null): string {
  if (!target) return ''
  return target.slice(0, 10)
}

/**
 * Format a nullable target date for display. Parses the date parts directly to
 * avoid the UTC-midnight timezone shift `new Date('YYYY-MM-DD')` introduces.
 * Returns null when there is no target date.
 */
export function formatTargetDate(target: string | null): string | null {
  const value = toDateInputValue(target)
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
