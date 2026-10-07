import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, ErrorState, Notice, Skeleton } from '#/components/kit'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { previewCvDraft } from '#/lib/api/client'
import { describeFailure } from '#/lib/api/errors'
import type { CvDocument, CvPreview, CvStyle } from '#/lib/api/schemas'
import { toPayload } from './useCvDraft'

/** How long the draft must rest before the server renders it. */
export const PREVIEW_DEBOUNCE_MS = 400

type Draft = Pick<CvDocument, 'name' | 'sections' | 'style' | 'header'>

/** The rectangle fragments of one section, by page, in reading order. */
type Hit = CvPreview['sections'][number]

function hitLabel(hit: Hit, titles: Map<string, string>, continued: boolean) {
  const base = hit.id === 'header' ? 'Edit header' : `Edit ${titles.get(hit.id) || 'section'}`
  return continued ? `${base}, continued on page ${hit.page + 1}` : base
}

/**
 * The CV as the server prints it: page images of the unsaved draft (the same engine as the exported PDF), with
 * a button over every section that opens its editor. The draft is sent ~400ms after the last edit; until the new
 * pages arrive the previous ones stay on screen, dimmed. Without `onEdit` the pages are only to look at.
 */
/** Plain words for how a fit-to-one-page attempt ended, or null when there is nothing to say. */
export function fitSentence(fit: NonNullable<CvPreview['fit']>) {
  if (fit.fits) return null
  const body = Number.isInteger(fit.body_pt) ? fit.body_pt : Number(fit.body_pt.toFixed(1))
  return `Couldn’t fit to one page: it runs to ${fit.pages} pages at the smallest size we allow (${body} pt text, ${Math.round(fit.scale * 100)}% spacing). Shorten a section or turn the option off.`
}

export function CvPagePreview({ documentId, draft, activeId, onEdit, headerActive, onEditHeader, onStyleChange, label = 'Live preview of your CV' }: {
  documentId: string
  draft: Draft
  activeId?: string
  onEdit?: (sectionId: string) => void
  headerActive?: boolean
  onEditHeader?: () => void
  /** Lets a length suggestion change the style (its button turns Fit to one page on). */
  onStyleChange?: (patch: Partial<CvStyle>) => void
  label?: string
}) {
  const serialized = JSON.stringify(toPayload(draft))
  const settled = useDebouncedValue(serialized, PREVIEW_DEBOUNCE_MS, documentId)
  const query = useQuery({
    // The abort signal of a superseded key reaches fetch: only the newest draft is ever rendered to the end.
    queryKey: ['cv-preview', documentId, settled],
    queryFn: ({ signal }) => previewCvDraft(documentId, JSON.parse(settled), { signal }),
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  })

  // The last pages that arrived for this CV: shown dimmed while the next ones are on their way, and under an error.
  const lastGood = useRef<{ documentId: string; preview: CvPreview } | null>(null)
  if (query.data) lastGood.current = { documentId, preview: query.data }
  const preview = query.data ?? (lastGood.current?.documentId === documentId ? lastGood.current.preview : undefined)
  const stale = serialized !== settled || query.isFetching || (query.isError && Boolean(preview))

  const titles = new Map(draft.sections.map((section) => [section.id, section.title.trim()]))
  const seen = new Set<string>()
  const hits = (preview?.sections ?? []).map((hit) => {
    const continued = seen.has(hit.id)
    seen.add(hit.id)
    return { hit, continued }
  })

  return (
    <div className="cvpv" data-testid="cv-preview" aria-busy={stale}>
      {query.isError ? (
        <ErrorState
          title="The preview couldn’t be drawn"
          description={`${describeFailure(query.error).message} Your CV is saved; the preview will catch up.`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}
      {preview?.warnings.map((warning) => (
        <Notice key={warning.code} tone="warning">{warning.message}</Notice>
      ))}
      {preview?.fit && fitSentence(preview.fit) ? <Notice tone="warning">{fitSentence(preview.fit)}</Notice> : null}
      {preview?.length?.advice ? (
        <Notice
          tone="info"
          action={preview.length.advice.action === 'fit_one_page' && onStyleChange
            ? <Button size="sm" variant="secondary" onClick={() => onStyleChange({ fit_one_page: true })}>Fit to one page</Button>
            : undefined}
        >
          {preview.length.advice.message}
        </Notice>
      ) : null}
      {preview ? (
        <div className="cvpv__stage" data-stale={stale ? 'true' : undefined}>
          <div className="cvpv__pages" data-testid="cv-pages" role="group" aria-label={label}>
            {preview.pages.map((page, index) => (
              <div className="cvpv__page" key={index} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                <img className="cvpv__image" src={page.url} width={page.width} height={page.height} alt={`Page ${index + 1} of your CV`} />
                {onEdit ? hits.filter(({ hit }) => hit.page === index).map(({ hit, continued }) => {
                  const header = hit.id === 'header'
                  const active = header ? Boolean(headerActive) : activeId === hit.id
                  return (
                    <button
                      key={`${hit.id}-${hit.page}`} type="button" className="cvpv__hit" aria-pressed={active}
                      aria-label={hitLabel(hit, titles, continued)}
                      style={{ left: `${hit.x * 100}%`, top: `${hit.y * 100}%`, width: `${hit.w * 100}%`, height: `${hit.h * 100}%` }}
                      onClick={() => (header ? onEditHeader?.() : onEdit(hit.id))}
                    />
                  )
                }) : null}
              </div>
            ))}
          </div>
        </div>
      ) : query.isError ? null : (
        <div role="status" className="cvpv__loading">
          <Skeleton variant="block" width="100%" height="min(70dvh, 52rem)" />
          <span className="kit-sr-only">Drawing your CV…</span>
        </div>
      )}
      <div className="cvpv__foot">
        <p className="cvpv__footnote">
          {preview
            ? preview.truncated
              ? `Showing the first ${preview.pages.length} of ${preview.page_count} pages`
              : preview.page_count === 1 ? '1 page' : `${preview.page_count} pages`
            : ' '}
        </p>
        <span role="status" className="cvpv__busy">{stale && preview ? <Badge tone="lemon" size="sm">Updating…</Badge> : null}</span>
      </div>
    </div>
  )
}
