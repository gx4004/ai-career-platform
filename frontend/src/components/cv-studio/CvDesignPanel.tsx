import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge, Notice, RadioGroup, RadioItem, Section, Segmented, Skeleton, Stack, Switch } from '#/components/kit'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { templateThumbnailsForDraft } from '#/lib/api/client'
import type { CvDocument, CvDocumentUpdate, CvStyle, CvStyleCatalog, CvTemplateThumbnails } from '#/lib/api/schemas'
import { toPayload } from './useCvDraft'

const TEMPLATE_GROUPS = [
  { group: 'ats-safe', title: 'ATS-safe' },
  { group: 'more', title: 'More designs' },
] as const
const TEMPLATE_FONT = 'template'
/** Sent as the draft's template with the thumbnails request; the server draws every template regardless. */
const DEFAULT_TEMPLATE: CvStyle['template_id'] = 'classic'
const TEMPLATE_ACCENT = 'template'
export const LESS_SAFE_NOTICE = 'Some job portals may read this layout out of order. Use an ATS-safe template for portal applications.'

const sentenceCase = (text: string) => text.replace('-', ' ').replace(/^./, (letter) => letter.toUpperCase())

/** How long the content and style must rest before the gallery is drawn again (it is the expensive call). */
export const THUMBNAILS_DEBOUNCE_MS = 1000
/** The page box of a thumbnail before it arrives, so the placeholder and the image take the same room. */
const PAGE_ASPECT: Record<CvStyle['page_size'], string> = { a4: '210 / 297', letter: '216 / 279' }

type Draft = Pick<CvDocument, 'name' | 'sections' | 'style' | 'header'>

/** A short, stable hash of a string (cyrb53), for the gallery's cache key. */
export function hashText(text: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

type ThumbnailsBody = Pick<CvDocumentUpdate, 'header' | 'sections'> & { drawn: Omit<CvStyle, 'template_id' | 'ats_mode' | 'fit_one_page'> }

/** What the thumbnails depend on, serialised: the content and every style field except the template (each tile is
 * its own template) and the options the thumbnails do not draw (ATS mode, fit to one page). */
export function thumbnailsKey(draft: Draft) {
  const { header, sections } = toPayload(draft)
  const { template_id: _template, ats_mode: _ats, fit_one_page: _fit, ...drawn } = draft.style
  return JSON.stringify({ header, sections, drawn } satisfies ThumbnailsBody)
}

export type TemplateThumbnailsState = {
  status: 'loading' | 'ready' | 'error'
  data?: CvTemplateThumbnails
}

/** The gallery request in flight per CV. A newer draft aborts it; closing (or remounting) the panel does not, because
 * the sheet remounts its body as it opens and the server would draw the whole gallery twice. */
const inFlight = new Map<string, AbortController>()

/**
 * Page 1 of the draft in every template, fetched while the Design panel is open. Cached by a hash of the content and
 * the drawn style fields, so picking a template never refetches; a content or style change refetches after a pause,
 * and the superseded request is aborted. The last gallery stays on screen while the next one is drawn.
 */
export function useTemplateThumbnails(documentId: string, draft: Draft): TemplateThumbnailsState {
  const settled = useDebouncedValue(thumbnailsKey(draft), THUMBNAILS_DEBOUNCE_MS, documentId)
  const query = useQuery({
    queryKey: ['cv-template-thumbnails', documentId, hashText(settled)],
    // React Query's own signal would cancel on unmount too; this one is aborted only by a newer draft.
    queryFn: async () => {
      inFlight.get(documentId)?.abort()
      const controller = new AbortController()
      inFlight.set(documentId, controller)
      const { header, sections, drawn } = JSON.parse(settled) as ThumbnailsBody
      const style: CvStyle = { ...drawn, template_id: DEFAULT_TEMPLATE, ats_mode: false, fit_one_page: false }
      try {
        return await templateThumbnailsForDraft(documentId, { header, sections, style }, { signal: controller.signal })
      } finally {
        if (inFlight.get(documentId) === controller) inFlight.delete(documentId)
      }
    },
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })
  if (query.data) return { status: 'ready', data: query.data }
  return { status: query.isError ? 'error' : 'loading' }
}

/** The Design panel with its template gallery drawn from the open CV. */
export function CvDesignTool({ documentId, draft, catalog, onChange }: {
  documentId: string; draft: Draft; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const thumbnails = useTemplateThumbnails(documentId, draft)
  return <CvDesignPanel style={draft.style} catalog={catalog} onChange={onChange} thumbnails={thumbnails} />
}

function galleryNote(locked: boolean, thumbnails?: TemplateThumbnailsState) {
  if (locked) return 'Paused while ATS-friendly mode is on.'
  if (!thumbnails) return undefined
  if (thumbnails.status === 'error') return 'The previews couldn’t be drawn right now. You can still pick a template by name.'
  if (thumbnails.data?.sample) return 'Shown with a sample CV until you add your own entries.'
  return 'Shown with your CV, colour and typeface.'
}

export function CvDesignPanel({ style, catalog, onChange, thumbnails }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
  /** The gallery pictures. Without it the templates are text-only tiles. */
  thumbnails?: TemplateThumbnailsState
}) {
  const pictures = new Map((thumbnails?.data?.thumbnails ?? []).map((thumbnail) => [thumbnail.template_id, thumbnail]))
  const picture = (template: CvStyleCatalog['templates'][number]) => {
    if (!thumbnails || thumbnails.status === 'error') return { media: undefined, aspect: undefined }
    if (thumbnails.status === 'loading') return { media: <Skeleton variant="block" />, aspect: PAGE_ASPECT[style.page_size] }
    const found = pictures.get(template.id)
    // A template the server could not draw (or did not send) falls back to a text-only tile.
    if (!found?.url) return { media: undefined, aspect: undefined }
    return {
      media: <img src={found.url} width={found.width} height={found.height} alt={`Preview of the ${template.name} template`} />,
      aspect: `${found.width} / ${found.height}`,
    }
  }

  const locked = style.ats_mode
  // ATS mode forces one template and offers only the ATS-safe ones; an id without a template yet
  // (or one the catalog does not list) shows as the first catalog template, as it prints.
  const shownId = locked ? catalog.ats_mode.template_id : style.template_id
  const selected = catalog.templates.find((template) => template.id === shownId) ?? catalog.templates[0]
  const offered = locked
    ? catalog.templates.filter((template) => catalog.ats_mode.offered_template_ids.includes(template.id))
    : catalog.templates

  return (
    <Stack gap={6}>
      <Section headingLevel={3} title="Mode">
        <Switch
          controlPosition="end"
          label="ATS-friendly mode"
          description="Uses a plain one-column layout and a standard font so application systems read every line."
          checked={locked}
          onCheckedChange={(ats_mode) => onChange({ ats_mode })}
        />
      </Section>

      <Section headingLevel={3} title="Template" description={galleryNote(locked, thumbnails)}>
        <Stack gap={4} aria-busy={thumbnails?.status === 'loading' || undefined}>
          {thumbnails?.status === 'loading' ? <span role="status" className="kit-sr-only">Drawing the template previews…</span> : null}
          {TEMPLATE_GROUPS.map(({ group, title }) => {
            const templates = offered.filter((template) => template.group === group)
            if (templates.length === 0) return null
            return (
              <Stack key={group} gap={2}>
                <Section headingLevel={4} title={title}>
                  <RadioGroup
                    aria-label={group === 'ats-safe' ? 'ATS-safe templates' : 'More designs'}
                    name="cv-template"
                    variant="tile"
                    disabled={locked}
                    value={selected.id}
                    onValueChange={(template_id) => onChange({ template_id: template_id as CvStyle['template_id'] })}
                  >
                    {templates.map((template) => {
                      const { media, aspect } = picture(template)
                      return (
                        <RadioItem
                          key={template.id}
                          value={template.id}
                          label={<>{template.name} <Badge size="sm" tone={template.ats_safe ? 'success' : 'neutral'}>{template.ats_safe ? 'ATS-safe' : 'Less ATS-safe'}</Badge></>}
                          description={<>{template.columns === 1 ? 'One column' : 'Two columns'}<span className="kit-sr-only">. {template.description}</span></>}
                          media={media}
                          mediaAspect={aspect}
                        />
                      )
                    })}
                  </RadioGroup>
                </Section>
              </Stack>
            )
          })}
          {!locked && !selected.ats_safe ? <Notice tone="warning">{LESS_SAFE_NOTICE}</Notice> : null}
        </Stack>
      </Section>

      <Section headingLevel={3} title="Font">
        <RadioGroup aria-label="Font" variant="card" disabled={locked} value={style.font_id ?? TEMPLATE_FONT} onValueChange={(font_id) => onChange({ font_id: font_id === TEMPLATE_FONT ? null : (font_id as NonNullable<CvStyle['font_id']>) })}>
          <RadioItem value={TEMPLATE_FONT} label="Template default" description="The typefaces the template was designed with." />
          {catalog.fonts.map((font) => (
            <RadioItem
              key={font.id}
              value={font.id}
              label={<span style={{ fontFamily: font.css_family }}>{font.name}</span>}
              meta={sentenceCase(font.category)}
            />
          ))}
        </RadioGroup>
      </Section>

      <Section headingLevel={3} title="Accent colour">
        <RadioGroup aria-label="Accent colour" variant="swatch" orientation="horizontal" disabled={locked} value={style.accent_color ?? TEMPLATE_ACCENT} onValueChange={(accent_color) => onChange({ accent_color: accent_color === TEMPLATE_ACCENT ? null : (accent_color as NonNullable<CvStyle['accent_color']>) })}>
          {/* The template's own colour (null): picking Ink, or any colour, is then a real choice. */}
          <RadioItem value={TEMPLATE_ACCENT} label={`Template colour (${catalog.palette.find(({ value }) => value === selected.default_accent)?.name ?? 'Ink'})`} swatch={selected.default_accent} />
          {catalog.palette.map(({ value, name }) => (
            <RadioItem key={value} value={value} label={name} swatch={value} />
          ))}
        </RadioGroup>
      </Section>

      <Section headingLevel={3} title="Spacing">
        <Segmented
          fullWidth
          aria-label="Spacing"
          disabled={locked}
          value={style.density}
          onValueChange={(density) => onChange({ density })}
          options={catalog.densities.map(({ id, name }) => ({ value: id, label: name }))}
        />
      </Section>

      <Section headingLevel={3} title="Length">
        <Switch
          controlPosition="end"
          label="Fit to one page"
          description="Shrinks the type and spacing a little, never below 9 pt text, to keep the CV on one page. If it can’t fit, it stays at that size and runs over."
          checked={style.fit_one_page}
          onCheckedChange={(fit_one_page) => onChange({ fit_one_page })}
        />
      </Section>

      <Section headingLevel={3} title="Page size">
        <Segmented
          fullWidth
          aria-label="Page size"
          value={style.page_size}
          onValueChange={(page_size) => onChange({ page_size })}
          options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]}
        />
      </Section>
    </Stack>
  )
}
