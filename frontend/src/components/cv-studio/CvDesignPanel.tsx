import { useEffect } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge, Notice, RadioGroup, RadioItem, Section, Segmented, Skeleton, Stack, Switch } from '#/components/kit'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { getTemplateThumbnails } from '#/lib/api/client'
import type { TemplateThumbnailsLook } from '#/lib/api/client'
import type { CvStyle, CvStyleCatalog, CvTemplateThumbnails } from '#/lib/api/schemas'

const TEMPLATE_GROUPS = [
  { group: 'ats-safe', title: 'ATS-safe' },
  { group: 'more', title: 'More designs' },
] as const
const TEMPLATE_FONT = 'template'
const TEMPLATE_ACCENT = 'template'
export const LESS_SAFE_NOTICE = 'Some job portals may read this layout out of order. Use an ATS-safe template for portal applications.'

const columns = (template: CvStyleCatalog['templates'][number]) => (template.columns === 1 ? 'One column' : 'Two columns')
const sentenceCase = (text: string) => text.replace('-', ' ').replace(/^./, (letter) => letter.toUpperCase())

/** How long the look must rest before the gallery is redrawn (picking colours in a row asks once). */
export const THUMBNAILS_DEBOUNCE_MS = 300
/** The same on a slow or data-saving connection. */
export const THUMBNAILS_SLOW_DEBOUNCE_MS = 1000
/** The page box of a thumbnail, so the placeholder and the picture take the same room. */
const PAGE_ASPECT: Record<CvStyle['page_size'], string> = { a4: '210 / 297', letter: '216 / 279' }
/** A panel that unmounts and mounts again within this time (the sheet does, as it opens) keeps its request. */
const REMOUNT_GRACE_MS = 400

export type TemplateThumbnailsState = {
  /** loading: nothing drawn yet; error: nothing could be drawn; ready: some or all pictures are here. */
  status: 'loading' | 'ready' | 'error'
  /** The pictures that have arrived (the first group before the rest). */
  data?: CvTemplateThumbnails
  /** Templates whose pictures are still being drawn (they show a placeholder). */
  pending?: string[]
}

/** The gallery requests in flight, by group. A newer look aborts its group's request; closing the panel aborts both
 * after a short grace, because the sheet remounts its body as it opens. */
const inFlight = new Map<number, AbortController>()
let closing: ReturnType<typeof setTimeout> | undefined

function slowConnection() {
  const connection = (globalThis.navigator as (Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }) | undefined)?.connection
  return Boolean(connection && (connection.saveData || /(^|-)(2g|3g)$/.test(connection.effectiveType ?? '')))
}

/** The style fields a tile is drawn with: everything but the template (each tile is its own), ATS mode and fit. */
export function thumbnailsLook(style: CvStyle): TemplateThumbnailsLook {
  return { accent_color: style.accent_color, font_id: style.font_id, density: style.density, page_size: style.page_size }
}

/**
 * Page 1 of the built-in sample CV in every template, in the person's look, fetched only while the Design panel is
 * open: the ATS-safe group first (the top of the gallery), then the rest, one request after the other. It does not
 * depend on the CV, so typing never redraws it; a colour, typeface, spacing or page-size change asks again after a
 * short pause (the server caches every tile, so a look seen before comes back at once). The last pictures stay on
 * screen meanwhile. Closing the panel aborts what is still being drawn.
 */
export function useTemplateThumbnails(style: CvStyle, catalog: CvStyleCatalog): TemplateThumbnailsState {
  const look = useDebouncedValue(JSON.stringify(thumbnailsLook(style)), slowConnection() ? THUMBNAILS_SLOW_DEBOUNCE_MS : THUMBNAILS_DEBOUNCE_MS)
  const groups = TEMPLATE_GROUPS
    .map(({ group }) => catalog.templates.filter((template) => template.group === group).map((template) => template.id))
    .filter((ids) => ids.length > 0)

  useEffect(() => {
    clearTimeout(closing)
    return () => {
      closing = setTimeout(() => {
        for (const controller of inFlight.values()) controller.abort()
        inFlight.clear()
      }, REMOUNT_GRACE_MS)
    }
  }, [])

  const groupQuery = (ids: string[] | undefined, index: number, enabled: boolean) => ({
    queryKey: ['cv-template-thumbnails', look, ids?.join(',') ?? ''],
    // React Query's own signal would cancel on every unmount; this one is aborted by a newer look or a close.
    queryFn: async () => {
      inFlight.get(index)?.abort()
      const controller = new AbortController()
      inFlight.set(index, controller)
      try {
        return await getTemplateThumbnails(JSON.parse(look) as TemplateThumbnailsLook, { signal: controller.signal, templates: ids })
      } finally {
        if (inFlight.get(index) === controller) inFlight.delete(index)
      }
    },
    enabled: enabled && Boolean(ids),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const first = useQuery(groupQuery(groups[0], 0, true))
  const firstSettled = (first.isSuccess && !first.isPlaceholderData) || first.isError
  const second = useQuery(groupQuery(groups[1], 1, firstSettled))

  const parts = [first, second].slice(0, groups.length)
  const arrived = parts.flatMap((part) => part.data?.thumbnails ?? [])
  const pending = parts.flatMap((part, index) => (!part.data && !part.isError ? groups[index] : []))
  if (parts.every((part) => part.isError && !part.data)) return { status: 'error' }
  if (arrived.length === 0) return { status: 'loading', pending }
  return { status: 'ready', data: { thumbnails: arrived }, pending }
}

/** The Design panel with its template gallery. */
export function CvDesignTool({ style, catalog, onChange }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const thumbnails = useTemplateThumbnails(style, catalog)
  return <CvDesignPanel style={style} catalog={catalog} onChange={onChange} thumbnails={thumbnails} />
}

function galleryNote(locked: boolean, thumbnails?: TemplateThumbnailsState) {
  if (locked) return 'Paused while ATS-friendly mode is on.'
  if (!thumbnails) return undefined
  if (thumbnails.status === 'error') return 'The previews couldn’t be drawn right now. You can still pick a template by name.'
  return 'Sample content, in your colour, typeface and spacing.'
}

export function CvDesignPanel({ style, catalog, onChange, thumbnails }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
  /** The gallery pictures. Without it the templates are text-only tiles. */
  thumbnails?: TemplateThumbnailsState
}) {
  const pictures = new Map((thumbnails?.data?.thumbnails ?? []).map((thumbnail) => [thumbnail.template_id, thumbnail]))
  const picture = (template: CvStyleCatalog['templates'][number]) => {
    if (!thumbnails || thumbnails.status === 'error') return { media: undefined, aspect: undefined }
    if (thumbnails.status === 'loading' || thumbnails.pending?.includes(template.id)) return { media: <Skeleton variant="block" />, aspect: PAGE_ASPECT[style.page_size] }
    const found = pictures.get(template.id)
    // A template the server could not draw (or did not send) falls back to a text-only tile.
    if (!found?.url) return { media: undefined, aspect: undefined }
    // The box keeps the page size's ratio from skeleton to picture, so nothing moves when the pictures arrive.
    return {
      media: <img src={found.url} width={found.width} height={found.height} alt={`Preview of the ${template.name} template`} />,
      aspect: PAGE_ASPECT[style.page_size],
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
                          label={template.name}
                          description={
                            <>
                              <Badge size="sm" tone={template.ats_safe ? 'success' : 'neutral'}>{template.ats_safe ? 'ATS-safe' : 'Less ATS-safe'}</Badge>
                              <span className="kit-sr-only">. {columns(template)}. {template.description}</span>
                            </>
                          }
                          meta={<span aria-hidden="true">{columns(template)}</span>}
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
