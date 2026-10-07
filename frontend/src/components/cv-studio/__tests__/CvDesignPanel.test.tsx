import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CvDesignPanel, CvDesignTool, THUMBNAILS_DEBOUNCE_MS, type TemplateThumbnailsState } from '#/components/cv-studio/CvDesignPanel'
import { ApiError } from '#/lib/api/errors'
import { CV_ACCENT_PALETTE, cvStyleSchema } from '#/lib/api/schemas'
import type { CvStyle, CvTemplateThumbnails } from '#/lib/api/schemas'
import { styleCatalogFixture } from '#/lib/cv-studio/__tests__/styleCatalog.fixture'

const api = vi.hoisted(() => ({ getTemplateThumbnails: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

const style = cvStyleSchema.parse({})

function panel(patch = vi.fn(), current = style) {
  render(<CvDesignPanel style={current} catalog={styleCatalogFixture} onChange={patch} />)
  return patch
}

describe('CvDesignPanel style controls', () => {
  it('offers Template default plus the six catalog typefaces, defaulting to the template pairing', () => {
    const onChange = panel()
    const fonts = within(screen.getByRole('radiogroup', { name: 'Font' })).getAllByRole('radio')
    expect(fonts.map((radio) => radio.closest('label')?.textContent ?? '')).toEqual([
      expect.stringContaining('Template default'),
      expect.stringContaining('Inter'),
      expect.stringContaining('Source Sans 3'),
      expect.stringContaining('IBM Plex Sans'),
      expect.stringContaining('Source Serif 4'),
      expect.stringContaining('Lora'),
      expect.stringContaining('EB Garamond'),
    ])
    expect((screen.getByRole('radio', { name: /Template default/ }) as HTMLInputElement).checked || screen.getByRole('radio', { name: /Template default/ }).getAttribute('aria-checked') === 'true' || screen.getByRole('radio', { name: /Template default/ }).getAttribute('data-state') === 'checked').toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Lora/ }))
    expect(onChange).toHaveBeenCalledWith({ font_id: 'lora' })
  })

  it('returns to the template pairing with null', () => {
    const onChange = panel(vi.fn(), { ...style, font_id: 'lora' })
    fireEvent.click(screen.getByRole('radio', { name: /Template default/ }))
    expect(onChange).toHaveBeenCalledWith({ font_id: null })
  })

  it('shows the template colour plus the ten catalog accents as swatches and every one is a valid style colour', () => {
    const onChange = panel()
    const swatches = within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getAllByRole('radio')
    expect(swatches).toHaveLength(11)
    expect(styleCatalogFixture.palette.map((c) => c.value)).toEqual([...CV_ACCENT_PALETTE])
    fireEvent.click(screen.getByRole('radio', { name: 'Plum' }))
    expect(onChange).toHaveBeenCalledWith({ accent_color: '#9D174D' })
    for (const color of CV_ACCENT_PALETTE) expect(cvStyleSchema.parse({ accent_color: color }).accent_color).toBe(color)
  })

  it('keeps the template colour (null) apart from an explicit Ink', () => {
    const onChange = panel(vi.fn(), { ...style, template_id: 'lagoon' })
    const own = screen.getByRole('radio', { name: 'Template colour (Teal)' })
    expect((own as HTMLInputElement).checked || own.getAttribute('aria-checked') === 'true' || own.getAttribute('data-state') === 'checked').toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Ink' }))
    expect(onChange).toHaveBeenCalledWith({ accent_color: '#111827' })
    cleanup()
    const back = panel(vi.fn(), { ...style, template_id: 'lagoon', accent_color: '#111827' })
    fireEvent.click(screen.getByRole('radio', { name: 'Template colour (Teal)' }))
    expect(back).toHaveBeenCalledWith({ accent_color: null })
    expect(cvStyleSchema.parse({}).accent_color).toBeNull()
  })

  it('has spacing and page size controls', () => {
    const onChange = panel()
    fireEvent.click(screen.getByRole('radio', { name: 'Roomy' }))
    expect(onChange).toHaveBeenCalledWith({ density: 'spacious' })
    fireEvent.click(screen.getByRole('radio', { name: 'Letter' }))
    expect(onChange).toHaveBeenCalledWith({ page_size: 'letter' })
  })

  it('locks typeface, accent and spacing in ATS-friendly mode', () => {
    panel(vi.fn(), { ...style, ats_mode: true })
    expect(screen.getByRole('radio', { name: /Inter/ }).hasAttribute('disabled') || screen.getByRole('radio', { name: /Inter/ }).getAttribute('aria-disabled') === 'true').toBe(true)
    expect(screen.getByRole('radio', { name: 'Plum' }).hasAttribute('disabled') || screen.getByRole('radio', { name: 'Plum' }).getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('has a Fit to one page switch wired to style.fit_one_page', () => {
    const onChange = panel()
    const toggle = screen.getByRole('switch', { name: /Fit to one page/ })
    expect((toggle as HTMLInputElement).checked).toBe(false)
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ fit_one_page: true })
  })

  it('shows the switch on when the style fits to one page', () => {
    const onChange = panel(vi.fn(), { ...style, fit_one_page: true })
    const toggle = screen.getByRole('switch', { name: /Fit to one page/ })
    expect((toggle as HTMLInputElement).checked).toBe(true)
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ fit_one_page: false })
  })
})

const PIXEL = 'data:image/webp;base64,UklGRg=='
const ids = styleCatalogFixture.templates.map((template) => template.id)
const thumbnailsFor = (patch: Partial<Record<string, Partial<CvTemplateThumbnails['thumbnails'][number]>>> = {}, only?: readonly string[]): CvTemplateThumbnails => ({
  thumbnails: (only ?? ids).map((template_id) => ({ template_id, url: PIXEL, width: 320, height: 453, error: null, ...patch[template_id] })),
})
const ready = (data = thumbnailsFor()): TemplateThumbnailsState => ({ status: 'ready', data })
const templateRadio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement
const tileOf = (name: string) => templateRadio(name).closest('label') as HTMLElement

describe('CvDesignPanel template gallery', () => {
  it('is two radio groups of tiles, ATS-safe first, each named by the template, described by its badge, columns and summary', () => {
    panel(vi.fn(), style)
    const safe = screen.getByRole('radiogroup', { name: 'ATS-safe templates' })
    const more = screen.getByRole('radiogroup', { name: 'More designs' })
    expect(safe.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(safe.getAttribute('data-variant')).toBe('tile')
    expect(within(safe).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['classic', 'executive'])
    expect(screen.getByRole('radio', { name: 'Classic', description: /^ATS-safe One column\. A quiet single column\.$/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Lagoon', description: /^Less ATS-safe Two columns\. Teal sidebar\.$/ })).toBeTruthy()
    expect(templateRadio('Classic').checked).toBe(true)
    expect(tileOf('Classic').hasAttribute('data-checked')).toBe(true)
  })

  it('shows a text-only tile without thumbnails (no picture, no placeholder)', () => {
    panel()
    expect(tileOf('Classic').querySelector('.kit-radio__media')).toBeNull()
  })

  it('shows a page-shaped skeleton in every tile while the thumbnails load', () => {
    render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={{ status: 'loading' }} />)
    for (const name of ['Classic', 'Executive', 'Lagoon']) {
      const media = tileOf(name).querySelector('.kit-radio__media') as HTMLElement
      expect(media.querySelector('.kit-skeleton')).toBeTruthy()
      expect(media.style.getPropertyValue('--kit-radio-media-ratio')).toBe('210 / 297')
    }
    expect(screen.getByText('Drawing the template previews…')).toBeTruthy()
    cleanup()
    render(<CvDesignPanel style={{ ...style, page_size: 'letter' }} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={{ status: 'loading' }} />)
    expect((tileOf('Classic').querySelector('.kit-radio__media') as HTMLElement).style.getPropertyValue('--kit-radio-media-ratio')).toBe('216 / 279')
  })

  it('shows each template’s own picture with a plain alt text, in a page-shaped box, labelled as sample content', () => {
    render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={ready()} />)
    const image = within(tileOf('Lagoon')).getByRole('img', { name: 'Preview of the Lagoon template' })
    expect(image.getAttribute('src')).toBe(PIXEL)
    expect(image.getAttribute('width')).toBe('320')
    // The box keeps the page ratio from skeleton to picture, so nothing moves when the pictures arrive.
    expect((tileOf('Lagoon').querySelector('.kit-radio__media') as HTMLElement).style.getPropertyValue('--kit-radio-media-ratio')).toBe('210 / 297')
    expect(screen.getAllByRole('img', { name: /^Preview of the .* template$/ })).toHaveLength(3)
    expect(screen.getByText('Sample content, in your colour, typeface and spacing.')).toBeTruthy()
    // The picture is not part of the radio's name.
    expect(templateRadio('Lagoon')).toBeTruthy()
  })

  it('shows placeholders only for the group still being drawn', () => {
    render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={{ status: 'ready', data: thumbnailsFor({}, ['classic', 'executive']), pending: ['lagoon'] }} />)
    expect(within(tileOf('Classic')).getByRole('img')).toBeTruthy()
    expect(tileOf('Lagoon').querySelector('.kit-skeleton')).toBeTruthy()
  })

  it('falls back to a text-only tile for a template that could not be drawn, keeping the others', () => {
    const data = thumbnailsFor({ lagoon: { url: null, width: 0, height: 0, error: 'This preview could not be drawn.' } })
    render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={ready(data)} />)
    expect(tileOf('Lagoon').querySelector('.kit-radio__media')).toBeNull()
    expect(within(tileOf('Classic')).getByRole('img')).toBeTruthy()
    fireEvent.click(templateRadio('Lagoon'))
  })

  it('falls back to text-only tiles with a plain sentence when the whole gallery fails', () => {
    render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={{ status: 'error' }} />)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(document.querySelectorAll('.kit-radio__media')).toHaveLength(0)
    expect(screen.getByText(/The previews couldn’t be drawn right now/)).toBeTruthy()
  })

  it('selecting a tile (picture included) picks the template and a less ATS-safe one shows the notice', () => {
    const onChange = vi.fn()
    const view = render(<CvDesignPanel style={style} catalog={styleCatalogFixture} onChange={onChange} thumbnails={ready()} />)
    fireEvent.click(screen.getByRole('img', { name: 'Preview of the Lagoon template' }))
    expect(onChange).toHaveBeenCalledWith({ template_id: 'lagoon' })
    expect(screen.queryByText(/Some job portals/)).toBeNull()
    view.rerender(<CvDesignPanel style={{ ...style, template_id: 'lagoon' }} catalog={styleCatalogFixture} onChange={onChange} thumbnails={ready()} />)
    expect(templateRadio('Lagoon').checked).toBe(true)
    expect(screen.getByText(/Some job portals may read this layout out of order/)).toBeTruthy()
  })

  it('in ATS mode offers only the ATS-safe tiles, disabled, with Classic selected', () => {
    render(<CvDesignPanel style={{ ...style, ats_mode: true, template_id: 'lagoon' }} catalog={styleCatalogFixture} onChange={vi.fn()} thumbnails={ready()} />)
    expect(screen.queryByRole('radio', { name: /Lagoon/ })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'More designs' })).toBeNull()
    expect(templateRadio('Classic').checked).toBe(true)
    expect(templateRadio('Classic').disabled).toBe(true)
    expect(templateRadio('Executive').disabled).toBe(true)
    expect(screen.getByText('Paused while ATS-friendly mode is on.')).toBeTruthy()
    expect(screen.queryByText(/Some job portals/)).toBeNull()
  })
})

function tool(initial = style) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (next: CvStyle) => (
    <QueryClientProvider client={client}><CvDesignTool style={next} catalog={styleCatalogFixture} onChange={vi.fn()} /></QueryClientProvider>
  )
  const view = render(ui(initial))
  return { ...view, update: (next: CvStyle) => view.rerender(ui(next)) }
}
const groupOf = (call: unknown[]) => (call[1] as { templates?: string[] }).templates

describe('CvDesignTool fetches the gallery', () => {
  beforeEach(() => {
    api.getTemplateThumbnails.mockReset()
    api.getTemplateThumbnails.mockImplementation((_look: unknown, options: { templates?: string[] }) => Promise.resolve(thumbnailsFor({}, options.templates)))
  })
  afterEach(() => { vi.useRealTimers() })

  it('asks for the ATS-safe group first, then the rest, with the look only (no CV content)', async () => {
    tool({ ...style, accent_color: '#075985', fit_one_page: true, ats_mode: true, template_id: 'lagoon' })
    expect(document.querySelectorAll('.kit-skeleton').length).toBeGreaterThan(0)
    expect(await screen.findByRole('img', { name: 'Preview of the Classic template' })).toBeTruthy()
    await vi.waitFor(() => expect(api.getTemplateThumbnails).toHaveBeenCalledTimes(2))
    const [look] = api.getTemplateThumbnails.mock.calls[0]
    expect(look).toEqual({ accent_color: '#075985', font_id: null, density: 'normal', page_size: 'a4' })
    expect(api.getTemplateThumbnails.mock.calls.map(groupOf)).toEqual([['classic', 'executive'], ['lagoon']])
  })

  it('does not ask again when the template, ATS mode or fit changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const view = tool()
    await vi.waitFor(() => expect(api.getTemplateThumbnails).toHaveBeenCalledTimes(2))
    view.update({ ...style, template_id: 'lagoon' })
    view.update({ ...style, template_id: 'lagoon', ats_mode: true, fit_one_page: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(THUMBNAILS_DEBOUNCE_MS * 4) })
    expect(api.getTemplateThumbnails).toHaveBeenCalledTimes(2)
  })

  it('asks again after a short pause when the accent changes, keeping the old pictures meanwhile', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const view = tool()
    await screen.findByRole('img', { name: 'Preview of the Lagoon template' })
    view.update({ ...style, accent_color: '#B91C1C' })
    expect(screen.getByRole('img', { name: 'Preview of the Classic template' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(THUMBNAILS_DEBOUNCE_MS + 50) })
    await vi.waitFor(() => expect(api.getTemplateThumbnails).toHaveBeenCalledTimes(3))
    expect(api.getTemplateThumbnails.mock.calls[2][0].accent_color).toBe('#B91C1C')
  })

  it('aborts a request whose look was replaced before it finished', async () => {
    const signals: AbortSignal[] = []
    api.getTemplateThumbnails.mockImplementation((_look: unknown, options: { signal: AbortSignal }) => {
      signals.push(options.signal)
      return new Promise<CvTemplateThumbnails>(() => {})
    })
    const view = tool()
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    view.update({ ...style, density: 'compact' })
    await vi.waitFor(() => expect(signals).toHaveLength(2), { timeout: 3000 })
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('keeps the request when the panel remounts at once (the sheet does as it opens) and aborts it when it closes', async () => {
    const signals: AbortSignal[] = []
    let finish: (value: CvTemplateThumbnails) => void = () => {}
    api.getTemplateThumbnails.mockImplementation((_look: unknown, options: { signal: AbortSignal; templates?: string[] }) => {
      signals.push(options.signal)
      return new Promise<CvTemplateThumbnails>((resolve) => { finish = () => resolve(thumbnailsFor({}, options.templates)) })
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const ui = <QueryClientProvider client={client}><CvDesignTool style={{ ...style, density: 'spacious' }} catalog={styleCatalogFixture} onChange={vi.fn()} /></QueryClientProvider>
    const first = render(ui)
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    first.unmount()
    const second = render(ui)
    await act(async () => { finish(thumbnailsFor()) })
    expect(await screen.findByRole('img', { name: 'Preview of the Classic template' })).toBeTruthy()
    expect(signals[0].aborted).toBe(false)
    // The second group is in flight; closing the panel for good aborts it.
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    second.unmount()
    await vi.waitFor(() => expect(signals[1].aborted).toBe(true), { timeout: 2000 })
  })

  it('falls back to text-only tiles when the server cannot draw them', async () => {
    api.getTemplateThumbnails.mockRejectedValue(new ApiError('The PDF renderer is not available right now.', 503))
    tool({ ...style, page_size: 'letter' })
    expect(await screen.findByText(/The previews couldn’t be drawn right now/)).toBeTruthy()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(templateRadio('Lagoon').disabled).toBe(false)
  })
})
