import { act, cleanup as cleanupAll, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CvPagePreview, PREVIEW_DEBOUNCE_MS } from '#/components/cv-studio/CvPagePreview'
import { ApiError } from '#/lib/api/errors'
import type { CvDocument, CvPreview } from '#/lib/api/schemas'
import { PIXEL, previewFor } from '#/lib/cv-studio/__tests__/preview.fixture'

const api = vi.hoisted(() => ({ previewCvDraft: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

const style = { template_id: 'classic' as const, font_id: null, accent_color: '#111827' as const, density: 'normal' as const, ats_mode: false, page_size: 'a4' as const, fit_one_page: false }
const section = (id: string, title: string, kind: 'experience' | 'skills', position: number, body: string): CvDocument['sections'][number] => ({
  id, kind, title, visible: true, position, entries: [{ id: `${id}-e`, evidence_item_id: null, body, position: 0 }],
})
const header = { name: 'Ada Lovelace', headline: null, email: null, phone: null, location: null, links: [] }
const draftWith = (body: string) => ({
  name: 'Principal CV', header, style,
  sections: [section('s1', 'Experience', 'experience', 0, body), section('s2', 'Skills', 'skills', 1, 'Figma')],
})

type Props = Parameters<typeof CvPagePreview>[0]
function mount(props: Partial<Props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const base: Props = { documentId: 'd1', draft: draftWith('Built things.'), ...props }
  const ui = (next: Props) => <QueryClientProvider client={client}><CvPagePreview {...next} /></QueryClientProvider>
  const view = render(ui(base))
  return { ...view, update: (next: Partial<Props>) => view.rerender(ui({ ...base, ...next })) }
}

beforeEach(() => {
  api.previewCvDraft.mockReset()
  api.previewCvDraft.mockImplementation((_id: string, draft) => Promise.resolve(previewFor(draft)))
})
afterEach(() => { vi.useRealTimers() })

describe('CvPagePreview', () => {
  it('shows a skeleton, then the page image and a one-page footnote', async () => {
    mount()
    expect(screen.getByText('Drawing your CV…')).toBeTruthy()
    const image = await screen.findByAltText('Page 1 of your CV')
    expect(image.getAttribute('src')).toBe(PIXEL)
    expect(screen.getByText('1 page')).toBeTruthy()
    expect(screen.getByTestId('cv-preview').getAttribute('aria-busy')).toBe('false')
  })

  it('sends the cleaned draft the editor would save, not the stored copy', async () => {
    mount()
    await screen.findByAltText('Page 1 of your CV')
    const [id, body] = api.previewCvDraft.mock.calls[0]
    expect(id).toBe('d1')
    expect(body).toMatchObject({ name: 'Principal CV', style, header })
    expect(body.sections.map((item: { id: string }) => item.id)).toEqual(['s1', 's2'])
  })

  it('says how many pages, and when only the first are drawn', async () => {
    api.previewCvDraft.mockResolvedValue(previewFor({}, { page_count: 2, pages: [{ url: PIXEL, width: 909, height: 1287 }, { url: PIXEL, width: 909, height: 1287 }] }))
    const view = mount()
    expect(await screen.findByText('2 pages')).toBeTruthy()
    view.unmount()
    const eight = Array.from({ length: 8 }, () => ({ url: PIXEL, width: 909, height: 1287 }))
    api.previewCvDraft.mockResolvedValue(previewFor({}, { page_count: 11, pages: eight, truncated: true }))
    mount()
    expect(await screen.findByText('Showing the first 8 of 11 pages')).toBeTruthy()
  })

  it('shows the server’s warnings', async () => {
    api.previewCvDraft.mockResolvedValue(previewFor({}, { warnings: [{ code: 'unsupported_characters', message: 'These characters cannot be drawn in the chosen typeface: Ж', characters: ['Ж'] }] }))
    mount()
    expect(await screen.findByText(/cannot be drawn in the chosen typeface/)).toBeTruthy()
  })

  describe('length', () => {
    const advice = { code: 'just_over_one_page', message: 'Runs to 1.2 pages. One page is the usual length early in a career, so you may want to fit it to one page.', action: 'fit_one_page' as const }
    const two = { page_count: 2, pages: [{ url: PIXEL, width: 909, height: 1287 }, { url: PIXEL, width: 909, height: 1287 }] }

    it('shows the advice as a notice whose button turns Fit to one page on', async () => {
      api.previewCvDraft.mockResolvedValue(previewFor({}, { ...two, length: { pages: 2, last_page_fill: 0.2, advice } }))
      const onStyleChange = vi.fn()
      mount({ onStyleChange })
      expect(await screen.findByText(/Runs to 1.2 pages/)).toBeTruthy()
      expect(screen.getByText('2 pages')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Fit to one page' }))
      expect(onStyleChange).toHaveBeenCalledWith({ fit_one_page: true })
    })

    it('shows neutral advice without a button', async () => {
      const long = { code: 'long', message: 'This CV runs to 3 pages. Most readers decide on the first two, so lead with your strongest work.', action: null }
      api.previewCvDraft.mockResolvedValue(previewFor({}, { page_count: 3, length: { pages: 3, last_page_fill: 0.5, advice: long } }))
      mount({ onStyleChange: vi.fn() })
      expect(await screen.findByText(/lead with your strongest work/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Fit to one page' })).toBeNull()
    })

    it('shows nothing extra when there is no advice or the fit worked', async () => {
      api.previewCvDraft.mockResolvedValue(previewFor({}, { fit: { fits: true, pages: 1, scale: 0.8, body_pt: 9 }, length: { pages: 1, last_page_fill: 0.9, advice: null } }))
      mount({ onStyleChange: vi.fn() })
      expect(await screen.findByText('1 page')).toBeTruthy()
      expect(screen.queryByText(/Couldn’t fit/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Fit to one page' })).toBeNull()
    })

    it('explains the could-not-fit state with the pages and the floor', async () => {
      api.previewCvDraft.mockResolvedValue(previewFor({}, { ...two, fit: { fits: false, pages: 2, scale: 0.5, body_pt: 9 }, length: { pages: 2, last_page_fill: 0.6, advice: null } }))
      mount({ onStyleChange: vi.fn() })
      expect(await screen.findByText(/Couldn’t fit to one page: it runs to 2 pages at the smallest size we allow \(9 pt text, 50% spacing\)/)).toBeTruthy()
      expect(screen.getByText('2 pages')).toBeTruthy()
    })

    it('says when the fit search ran out of time instead of blaming the floor', async () => {
      api.previewCvDraft.mockResolvedValue(previewFor({}, { ...two, fit: { fits: false, pages: 2, scale: 1, body_pt: 10, reason: 'time' }, length: { pages: 2, last_page_fill: 0.6, advice: null } }))
      mount({ onStyleChange: vi.fn() })
      expect(await screen.findByText(/Couldn’t finish fitting to one page in time: it runs to 2 pages for now/)).toBeTruthy()
      expect(screen.queryByText(/smallest size we allow/)).toBeNull()
    })
  })

  describe('page image size', () => {
    afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 }) })
    const sized = (cssWidth: number, ratio: number) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return { width: this.classList.contains('cvpv') ? cssWidth : 0, height: 0, top: 0, left: 0, right: cssWidth, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      })
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ratio })
    }

    it('asks for pages drawn for the phone it is on (CSS width times pixel ratio, in steps)', async () => {
      sized(343, 3)
      mount()
      await screen.findByAltText('Page 1 of your CV')
      expect(api.previewCvDraft).toHaveBeenCalledTimes(1)
      // 343 px at a ratio capped to 2 is 686, rounded up to a 160 px step.
      expect(api.previewCvDraft.mock.calls[0][2].width).toBe(800)
    })

    it('never asks for more than 1600 px, and sends no size when it cannot measure', async () => {
      sized(1200, 2)
      mount()
      await screen.findByAltText('Page 1 of your CV')
      expect(api.previewCvDraft.mock.calls[0][2].width).toBe(1600)
      cleanupAll()
      sized(0, 2)
      mount()
      await vi.waitFor(() => expect(api.previewCvDraft).toHaveBeenCalledTimes(2))
      expect(api.previewCvDraft.mock.calls[1][2].width).toBeUndefined()
    })
  })

  describe('while typing', () => {
    it('waits for the draft to rest, then renders only the last version once', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const view = mount()
      await screen.findByAltText('Page 1 of your CV')
      expect(api.previewCvDraft).toHaveBeenCalledTimes(1)
      view.update({ draft: draftWith('Built t') })
      await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 100) })
      view.update({ draft: draftWith('Built the') })
      await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 100) })
      view.update({ draft: draftWith('Built the thing.') })
      await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 100) })
      expect(api.previewCvDraft).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(150) })
      expect(api.previewCvDraft).toHaveBeenCalledTimes(2)
      expect(api.previewCvDraft.mock.calls[1][1].sections[0].entries[0].body).toBe('Built the thing.')
    })

    it('keeps the previous pages, dimmed and marked busy, until the new ones arrive', async () => {
      let finish: (preview: CvPreview) => void = () => {}
      const view = mount()
      await screen.findByAltText('Page 1 of your CV')
      api.previewCvDraft.mockImplementationOnce(() => new Promise<CvPreview>((resolve) => { finish = resolve }))
      view.update({ draft: draftWith('Edited.') })
      // Resting draft not yet sent: the old page is already marked as out of date.
      expect(screen.getByTestId('cv-preview').getAttribute('aria-busy')).toBe('true')
      expect(screen.getByAltText('Page 1 of your CV')).toBeTruthy()
      expect(await screen.findByText('Updating…', undefined, { timeout: 2000 })).toBeTruthy()
      expect(document.querySelector('.cvpv__stage')?.getAttribute('data-stale')).toBe('true')
      expect(screen.getByAltText('Page 1 of your CV')).toBeTruthy()
      await vi.waitFor(() => expect(api.previewCvDraft).toHaveBeenCalledTimes(2))
      await act(async () => { finish(previewFor(draftWith('Edited.'), { page_count: 2, pages: [{ url: PIXEL, width: 909, height: 1287 }, { url: PIXEL, width: 909, height: 1287 }] })) })
      expect(await screen.findByText('2 pages')).toBeTruthy()
      expect(screen.queryByText('Updating…')).toBeNull()
      expect(document.querySelector('.cvpv__stage')?.getAttribute('data-stale')).toBeNull()
    })

    it('aborts the request of a draft that was replaced before it finished', async () => {
      const signals: AbortSignal[] = []
      api.previewCvDraft.mockImplementation((_id: string, _draft: unknown, options: { signal: AbortSignal }) => {
        signals.push(options.signal)
        return new Promise<CvPreview>(() => {})
      })
      const view = mount()
      await vi.waitFor(() => expect(signals).toHaveLength(1))
      expect(signals[0].aborted).toBe(false)
      view.update({ draft: draftWith('Next.') })
      await vi.waitFor(() => expect(signals).toHaveLength(2), { timeout: 2000 })
      expect(signals[0].aborted).toBe(true)
      expect(signals[1].aborted).toBe(false)
    })
  })

  describe('when the server cannot draw it', () => {
    it('explains a 503 in the server’s words and retries on request', async () => {
      api.previewCvDraft.mockRejectedValueOnce(new ApiError('The service is temporarily unavailable. Try again in a moment.', 503))
      mount()
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByText('The preview couldn’t be drawn')).toBeTruthy()
      expect(within(alert).getByText(/temporarily unavailable/)).toBeTruthy()
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
      expect(await screen.findByAltText('Page 1 of your CV')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(api.previewCvDraft).toHaveBeenCalledTimes(2)
    })

    it('leaves the last pages on screen, dimmed, under the error', async () => {
      const view = mount()
      await screen.findByAltText('Page 1 of your CV')
      api.previewCvDraft.mockRejectedValueOnce(new ApiError('Something went wrong on our side. Try again in a moment.', 500))
      view.update({ draft: draftWith('Edited.') })
      expect(await screen.findByRole('alert', undefined, { timeout: 2000 })).toBeTruthy()
      expect(screen.getByAltText('Page 1 of your CV')).toBeTruthy()
      expect(document.querySelector('.cvpv__stage')?.getAttribute('data-stale')).toBe('true')
    })
  })

  describe('section buttons', () => {
    it('are real buttons named after their section; clicking opens that section', async () => {
      const onEdit = vi.fn()
      const onEditHeader = vi.fn()
      mount({ onEdit, onEditHeader, activeId: 's2' })
      const experience = await screen.findByRole('button', { name: 'Edit Experience' })
      expect(experience.tagName).toBe('BUTTON')
      expect(experience.getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByRole('button', { name: 'Edit Skills' }).getAttribute('aria-pressed')).toBe('true')
      expect(experience.style.left).toBe('8%')
      fireEvent.click(experience)
      expect(onEdit).toHaveBeenCalledWith('s1')
      fireEvent.click(screen.getByRole('button', { name: 'Edit header' }))
      expect(onEditHeader).toHaveBeenCalledOnce()
      expect(onEdit).toHaveBeenCalledTimes(1)
    })

    it('say when a section continues on the next page, and are absent when nothing can be edited', async () => {
      const twoPages = previewFor({}, {
        page_count: 2,
        pages: [{ url: PIXEL, width: 909, height: 1287 }, { url: PIXEL, width: 909, height: 1287 }],
        sections: [
          { id: 's1', kind: 'experience', page: 0, x: 0.08, y: 0.2, w: 0.84, h: 0.75 },
          { id: 's1', kind: 'experience', page: 1, x: 0.08, y: 0.05, w: 0.84, h: 0.3 },
        ],
      })
      api.previewCvDraft.mockResolvedValue(twoPages)
      const view = mount({ onEdit: vi.fn() })
      expect(await screen.findByRole('button', { name: 'Edit Experience' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Edit Experience, continued on page 2' })).toBeTruthy()
      view.unmount()
      mount()
      await screen.findByAltText('Page 1 of your CV')
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })
})
