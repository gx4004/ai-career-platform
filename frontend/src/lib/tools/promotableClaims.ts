import type { EvidenceKind } from '#/lib/api/schemas'
import type { ToolId } from '#/lib/tools/registry'

/**
 * One reusable claim from a saved tool result that the user may explicitly
 * promote into their Evidence Profile (R11, #148).
 *
 * A claim is derived from the already-rendered result payload — it is not a
 * stored record. `key` is a per-render handle for React lists and de-dupe only;
 * it is never sent to the server and is never derived from a stable run
 * identifier, so promotion telemetry can carry no run id (D-066).
 */
export type PromotableClaim = {
  key: string
  kind: EvidenceKind
  /** A short name for the claim: the Add button's accessible name. */
  label: string
  /** What the row shows as its title: the question, or the paragraph. */
  title: string
  /** A second line under the title: an interview claim's answer. */
  detail?: string
  content: Record<string, unknown>
}

/**
 * Shortens text on a word boundary, never mid-word ("cutting p95 …", not "Postgre…"). A single word longer than
 * the limit is the only thing ever cut inside a word.
 */
export function truncateWords(text: string, max = 90): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  const head = trimmed.slice(0, max)
  const space = head.lastIndexOf(' ')
  const cut = space > 0 ? head.slice(0, space) : head.slice(0, max - 1)
  return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  )
}

/**
 * Derive the promotable claims for a given tool's saved result.
 *
 * Only tools whose output contains discrete, reusable claims expose any — an
 * interview answer becomes `interview-evidence`, a cover-letter body paragraph
 * becomes an `achievement` phrasing. Every other tool (and any malformed or
 * pre-R11 payload) yields an empty list, so those result views render unchanged.
 */
export function getPromotableClaims(
  toolId: ToolId,
  payload: Record<string, unknown>,
): PromotableClaim[] {
  if (toolId === 'interview') {
    return asRecordArray(payload.questions)
      .map((question, index): PromotableClaim | null => {
        const prompt = asString(question.question)
        const answer = asString(question.answer)
        if (!prompt || !answer) return null
        const content: Record<string, unknown> = { question: prompt, answer }
        const focusArea = asString(question.focus_area)
        if (focusArea) content.focus_area = focusArea
        return {
          key: `interview-${index}`,
          kind: 'interview-evidence',
          label: truncateWords(prompt, 90),
          title: prompt.trim(),
          detail: truncateWords(answer, 180),
          content,
        }
      })
      .filter((claim): claim is PromotableClaim => claim !== null)
  }

  if (toolId === 'cover-letter') {
    return asRecordArray(payload.body_points)
      .map((point, index): PromotableClaim | null => {
        const text = asString(point.text)
        if (!text) return null
        return {
          key: `cover-body-${index}`,
          kind: 'achievement',
          label: truncateWords(text),
          title: truncateWords(text, 220),
          content: { text },
        }
      })
      .filter((claim): claim is PromotableClaim => claim !== null)
  }

  return []
}
