import type { CvDocumentUpdate, CvPreview } from '#/lib/api/schemas'

/** A 1x1 transparent GIF: the test pages need a src, not a picture. */
export const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * What `previewCvDraft` answers for a draft: one A4 page (909x1287, the server's 110 dpi) with a header rectangle and one
 * stacked rectangle per visible section, in reading order. Enough to click through; the real layout is the server's.
 */
export function previewFor(draft: Omit<CvDocumentUpdate, 'expected_updated_at'>, extra: Partial<CvPreview> = {}): CvPreview {
  const visible = [...(draft.sections ?? [])].filter((section) => section.visible).sort((a, b) => a.position - b.position)
  const sections = [
    { id: 'header', kind: 'header', page: 0, x: 0.08, y: 0.05, w: 0.84, h: 0.08 },
    ...visible.map((section, index) => ({ id: section.id, kind: section.kind, page: 0, x: 0.08, y: 0.15 + index * 0.2, w: 0.84, h: 0.18 })),
  ]
  return { pages: [{ url: PIXEL, width: 909, height: 1287 }], page_count: 1, sections, warnings: [], truncated: false, ...extra }
}
