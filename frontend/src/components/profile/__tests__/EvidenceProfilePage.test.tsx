import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EvidenceProfilePage } from '#/components/profile/EvidenceProfilePage'

const api = vi.hoisted(() => ({
  listEvidenceItems: vi.fn(),
  confirmEvidenceItem: vi.fn(),
  confirmEvidenceItems: vi.fn(),
  createEvidenceItem: vi.fn(),
  exportCareerData: vi.fn(),
  importEvidenceFromResume: vi.fn(),
  updateEvidenceItem: vi.fn(),
  deleteEvidenceItem: vi.fn(),
  deleteEvidenceProfile: vi.fn(),
}))
const getDevelopmentPlanMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({ status: 'authenticated' as string }))
const resumeCarry = vi.hoisted(() => ({ resumeText: '' }))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  ...api,
}))

vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getDevelopmentPlanMock,
  updateDevelopmentItem: vi.fn(),
  deleteDevelopmentItem: vi.fn(),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionState.status, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/hooks/use-resume-carry', () => ({
  useResumeCarry: () => ({
    resumeText: resumeCarry.resumeText,
    hasResume: resumeCarry.resumeText.length > 0,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function makeItem(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'id',
    kind: 'experience',
    content: { title: 'Backend Engineer' },
    provenance: 'imported',
    confirmation_state: 'unconfirmed',
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  }
}

const items: EvidenceItem[] = [
  makeItem({ id: 'e1', kind: 'experience', content: { title: 'Backend Engineer' } }),
  makeItem({ id: 'e2', kind: 'project', content: { name: 'Payments service' } }),
  makeItem({
    id: 's1',
    kind: 'skill',
    content: { name: 'TypeScript', level: 'Advanced' },
    confirmation_state: 'confirmed',
    provenance: 'user-entered',
  }),
]

function WarmRecommendationsConsumer() {
  useQuery({ queryKey: ['discovery', 'recommendations'], queryFn: warmRecommendationsFetchMock })
  return null
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WarmRecommendationsConsumer />
      <ToastProvider>
        <EvidenceProfilePage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('EvidenceProfilePage', () => {
  beforeEach(() => {
    sessionState.status = 'authenticated'
    sessionStorage.removeItem('cw:profile-split')
    sessionStorage.removeItem('cw:profile-empty')
    resumeCarry.resumeText = ''
    api.listEvidenceItems.mockReset().mockResolvedValue({ items })
    api.confirmEvidenceItem.mockReset().mockResolvedValue(makeItem({ confirmation_state: 'confirmed' }))
    api.confirmEvidenceItems.mockReset().mockResolvedValue({ items: [] })
    api.createEvidenceItem.mockReset().mockResolvedValue(makeItem({ id: 'new', kind: 'skill', content: { name: 'Rust' }, confirmation_state: 'confirmed', provenance: 'user-entered' }))
    api.exportCareerData.mockReset().mockResolvedValue({ schema_version: 'career-data-export/v1' })
    api.importEvidenceFromResume.mockReset().mockResolvedValue({ items: [] })
    api.updateEvidenceItem.mockReset().mockResolvedValue(makeItem({ confirmation_state: 'confirmed' }))
    api.deleteEvidenceItem.mockReset().mockResolvedValue(undefined)
    api.deleteEvidenceProfile.mockReset().mockResolvedValue(undefined)
    getDevelopmentPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({ items: [] })
    openAuthDialogMock.mockReset()
  })

  it('lists each suggestion once and groups only saved facts by kind', async () => {
    renderPage()

    const suggestions = await screen.findByRole('list', { name: 'Suggestions to review' })
    // A row's own source line is a list too, so count the list's direct rows.
    expect(suggestions.querySelectorAll(':scope > li')).toHaveLength(2)
    // The answers take the kit's line under the text on a narrow list, so they never cover the fact (no page grid of its own).
    for (const actions of suggestions.querySelectorAll(':scope > li > .kit-row__actions')) {
      expect(actions.getAttribute('data-placement')).toBe('below')
    }
    const skills = await screen.findByRole('list', { name: 'Skills' })
    expect(within(skills).getByText('TypeScript')).toBeTruthy()
    // Saved facts hold only icon buttons (edit, delete), so they keep the row's end at every width (consistency-F07):
    // 'below' dropped the 36px pencil onto its own line under a one-line fact in any list under 32rem (1024, phones).
    for (const actions of skills.querySelectorAll(':scope > li > .kit-row__actions')) {
      expect(actions.getAttribute('data-placement')).toBeNull()
    }
    expect(screen.queryByRole('list', { name: 'Experience' })).toBeNull()
    expect(screen.getAllByText('Backend Engineer')).toHaveLength(1)
  })

  it('saves a suggestion with its one primary action', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save Backend Engineer' }))

    await waitFor(() => expect(api.confirmEvidenceItem).toHaveBeenCalledWith('e1'))
  })

  it('tells the owner when saving a suggestion fails', async () => {
    api.confirmEvidenceItem.mockRejectedValueOnce(new Error('Could not save.'))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save Backend Engineer' }))

    // The toast provider keeps its own empty alert region, so look at what every alert says.
    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((node) => node.textContent).join(' ')).toContain('Could not save.'),
    )
  })

  it('dismissing a suggestion inline deletes it', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Backend Engineer' }))

    await waitFor(() => expect(api.deleteEvidenceItem).toHaveBeenCalledWith('e1'))
    expect(api.confirmEvidenceItem).not.toHaveBeenCalled()
  })

  describe('Save all', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('waits a few seconds so Undo is real, then saves every suggestion in one call', async () => {
      renderPage()
      const saveAll = await screen.findByRole('button', { name: 'Save all' })
      vi.useFakeTimers({ shouldAdvanceTime: true })

      fireEvent.click(saveAll)
      // The facts already read as saved; nothing has been written yet.
      expect(screen.queryByRole('list', { name: 'Suggestions to review' })).toBeNull()
      expect(api.confirmEvidenceItems).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(6100)
      await waitFor(() => expect(api.confirmEvidenceItems).toHaveBeenCalledWith(['e1', 'e2']))
    })

    it('Undo cancels the write and brings the suggestions back', async () => {
      renderPage()
      const saveAll = await screen.findByRole('button', { name: 'Save all' })
      vi.useFakeTimers({ shouldAdvanceTime: true })

      fireEvent.click(saveAll)
      fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
      await vi.advanceTimersByTimeAsync(7000)

      expect(api.confirmEvidenceItems).not.toHaveBeenCalled()
      expect(screen.getByRole('list', { name: 'Suggestions to review' })).toBeTruthy()
    })
  })

  it('adds a fact by hand as a user-entered fact', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a fact' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Rust ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save fact' }))

    await waitFor(() =>
      expect(api.createEvidenceItem).toHaveBeenCalledWith({ kind: 'skill', content: { name: 'Rust' }, provenance: 'user-entered' }),
    )
  })

  it('opens Add a fact once on arrival from the dashboard\'s "Add skills", then drops the hand-off', async () => {
    const onStartHandled = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <EvidenceProfilePage startAdding onStartHandled={onStartHandled} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('dialog', { name: 'Add a fact' })).toBeTruthy()
    expect(onStartHandled).toHaveBeenCalledTimes(1)
  })

  // history-profile-F31: the deep link opens the dialog with no trigger behind it; closing it must not drop focus on BODY.
  it('hands focus to the header Add a fact button when the dialog the dashboard link opened is closed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <EvidenceProfilePage startAdding onStartHandled={() => {}} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Add a fact' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const header = document.querySelector('.kit-page-header') as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(within(header).getByRole('button', { name: 'Add a fact' })))
  })

  // consistency-F27: the header's actions do not depend on the facts, so they hold their place while the list loads;
  // appearing only with the data made the page jump.
  it('shows the header actions while the facts load, and keeps them once they land', async () => {
    let resolve: (value: { items: EvidenceItem[] }) => void = () => {}
    api.listEvidenceItems.mockReturnValue(new Promise((done) => { resolve = done }))
    renderPage()

    const header = await waitFor(() => document.querySelector('.kit-page-header') as HTMLElement)
    const add = within(header).getByRole('button', { name: 'Add a fact' })
    expect(within(header).getByRole('link', { name: /Upload a CV in Resume Analyzer/ })).toBeTruthy()
    expect(header.querySelector('[class*="kit-skeleton"]')).toBeTruthy()

    resolve({ items })
    await waitFor(() => expect(header.querySelector('[class*="kit-skeleton"]')).toBeNull())
    expect(within(header).getByRole('button', { name: 'Add a fact' })).toBe(add)
  })

  // history-profile-F37: an empty profile has no header actions, so a tab that last saw it empty keeps them back while
  // the list loads (showing them first made the header jump when they left).
  it('keeps the header actions back while loading when this tab last saw the profile empty', async () => {
    sessionStorage.setItem('cw:profile-empty', '1')
    let resolve: (value: { items: EvidenceItem[] }) => void = () => {}
    api.listEvidenceItems.mockReturnValue(new Promise((done) => { resolve = done }))
    renderPage()

    const header = await waitFor(() => document.querySelector('.kit-page-header') as HTMLElement)
    await waitFor(() => expect(within(header).queryByRole('button', { name: 'Add a fact' })).toBeNull())

    resolve({ items })
    expect(await within(header).findByRole('button', { name: 'Add a fact' })).toBeTruthy()
    // That load had facts: the next one shows the actions while it loads.
    expect(sessionStorage.getItem('cw:profile-empty')).toBeNull()
  })

  it('will not add an empty fact', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a fact' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save fact' }))

    expect(await within(dialog).findByText('Write the fact first.')).toBeTruthy()
    expect(api.createEvidenceItem).not.toHaveBeenCalled()
  })

  // Same label as the Data and privacy rows in Settings and Account (one action, one name everywhere).
  it('offers Export data beside Delete profile', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Export data' }))
    await waitFor(() => expect(api.exportCareerData).toHaveBeenCalledOnce())
  })

  it('reads Imported after importing the carried CV, and says so when a repeat finds nothing new', async () => {
    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [makeItem({ id: 'new', kind: 'skill', content: { name: 'Rust' } })] })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))

    const done = await screen.findByRole('button', { name: /Imported/ })
    expect((done as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Import from your CV/ })).toBeNull()
    expect(api.deleteEvidenceItem).not.toHaveBeenCalled()
    expect(api.importEvidenceFromResume).toHaveBeenCalledTimes(1)
  })

  it('says everything is already there when the API finds nothing new in the CV', async () => {
    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [] })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))

    expect(await screen.findByText('Everything in your CV is already on your profile.')).toBeTruthy()
  })

  it('offers the import in the kit die-cut empty state, the first-run pattern of every page (consistency-F01)', async () => {
    api.listEvidenceItems.mockResolvedValue({ items: [] })
    renderPage()

    // Was a page-styled lemon sticker with its own heading style; now the same EmptyState as History and Applications.
    const title = await screen.findByRole('heading', { name: 'Import from your CV' })
    expect(title.closest('.kit-empty')).toBeTruthy()
    expect(title.closest('.kit-sticker')).toBeNull()
    // consistency-F18: the empty state's one action is short enough for one line on a 320px phone ("Upload a CV in
    // Resume Analyzer" wrapped to two, its icon stranded at the edge); the description says where the upload happens.
    const upload = screen.getByRole('link', { name: 'Upload a CV' })
    expect(upload.closest('.kit-empty')).toBe(title.closest('.kit-empty'))
    expect(upload.getAttribute('href')).toBe('/resume')
    expect(title.closest('.kit-empty')?.textContent).toContain('in Resume Analyzer')
  })

  it('edits a saved fact through one labelled field per value', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit TypeScript' }))
    const dialog = await screen.findByRole('dialog')
    // The skill's main field reads "Skill", as in Add a fact (it used to show the raw content key, "Name").
    fireEvent.change(within(dialog).getByLabelText('Skill'), { target: { value: 'TypeScript, React' } })
    fireEvent.change(within(dialog).getByLabelText('Level'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save fact' }))

    await waitFor(() =>
      expect(api.updateEvidenceItem).toHaveBeenCalledWith('s1', { content: { name: 'TypeScript, React' } }),
    )
  })

  it('deletes a saved fact through the confirm dialog and refreshes warm caches', async () => {
    renderPage()
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete TypeScript' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete fact/ }))

    await waitFor(() => expect(api.deleteEvidenceItem).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
  })

  it('moves focus to the next saved fact after a delete, never to the page body', async () => {
    const python = makeItem({ id: 's2', kind: 'skill', content: { name: 'Python' }, confirmation_state: 'confirmed', provenance: 'user-entered' })
    api.listEvidenceItems.mockResolvedValueOnce({ items: [...items, python] }).mockResolvedValue({ items: [items[0], items[1], python] })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete TypeScript' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Delete fact/ }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement?.id).toBe('fact-s2'))
  })

  it('moves focus to the Saved facts heading when the last saved fact is deleted', async () => {
    api.listEvidenceItems.mockResolvedValueOnce({ items }).mockResolvedValue({ items: [items[0], items[1]] })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete TypeScript' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Delete fact/ }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Saved facts' })))
  })

  it('after Delete profile says it is done, goes back to the top and focuses the page title', async () => {
    api.listEvidenceItems.mockResolvedValueOnce({ items }).mockResolvedValue({ items: [] })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: /Delete profile/ }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete your profile?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete profile' }))

      expect((await screen.findAllByText('Your profile was deleted')).length).toBeGreaterThan(0)
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Your profile' })))
      expect(scrollTo).toHaveBeenCalled()
    } finally {
      scrollTo.mockRestore()
    }
  })

  it('offers Add a fact once on an empty profile: in the empty state, not in the header too', async () => {
    api.listEvidenceItems.mockResolvedValue({ items: [] })
    renderPage()

    await screen.findByRole('heading', { name: 'Import from your CV' })
    expect(screen.getAllByRole('button', { name: 'Add a fact' })).toHaveLength(1)
    expect(within(document.querySelector('.kit-page-header') as HTMLElement).queryByRole('button', { name: 'Add a fact' })).toBeNull()
  })

  it('deletes the whole profile through the bulk endpoint', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Delete profile/ }))
    // Same title and confirm label as the Settings dialog for the same DELETE (one shared copy, not "Delete everything").
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete your profile?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete profile' }))

    await waitFor(() => expect(api.deleteEvidenceProfile).toHaveBeenCalledOnce())
  })

  it('links to the resume page to upload a CV, or imports the carried one', async () => {
    const { unmount } = renderPage()
    expect((await screen.findByRole('link', { name: /Upload a CV/ })).getAttribute('href')).toBe('/resume')
    unmount()

    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [items[0], items[1]] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))

    await waitFor(() => expect(api.importEvidenceFromResume).toHaveBeenCalledWith('x'.repeat(80)))
    expect(await screen.findByText('Added 2 suggestions to review.')).toBeTruthy()
  })

  it('hands the saved facts to CV Studio', async () => {
    renderPage()
    expect((await screen.findByRole('link', { name: 'Start a CV from these facts' })).getAttribute('href')).toBe('/cv-studio')
  })

  // history-profile-F27: the "Saved" badge is the row's kit meta, so a narrow list puts it under the text, not before the title.
  it('shows a just-saved fact\'s Saved badge in the row\'s meta slot', async () => {
    api.listEvidenceItems.mockResolvedValueOnce({ items }).mockResolvedValue({
      items: [{ ...items[0], confirmation_state: 'confirmed' as const }, items[1], items[2]],
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save Backend Engineer' }))

    const label = await screen.findByText('Saved', { selector: '.kit-badge__label' })
    expect(label.closest('.kit-badge')?.parentElement?.classList.contains('kit-row__meta')).toBe(true)
  })

  // history-profile-F28: a phone keeps the seal, the text and Dismiss on one row; the seal steps down to 96px.
  it('stamps a 96px seal on a phone and 132px on wider screens', async () => {
    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [items[0], items[1]] })
    const width = window.innerWidth
    window.innerWidth = 375
    try {
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))
      await screen.findByText('Added 2 suggestions to review.')
      const seal = document.querySelector('.profile-stamp .kit-seal') as HTMLElement
      expect(seal.style.getPropertyValue('--seal')).toBe('96px')
    } finally {
      window.innerWidth = width
    }
  })

  it('drops the "facts found" stamp once nothing is left to review', async () => {
    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [items[0], items[1]] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))
    expect(await screen.findByText('Added 2 suggestions to review.')).toBeTruthy()

    api.listEvidenceItems.mockResolvedValue({ items: items.map((item) => ({ ...item, confirmation_state: 'confirmed' as const })) })
    fireEvent.click(screen.getByRole('button', { name: 'Save Backend Engineer' }))
    await waitFor(() => expect(screen.queryByText('Added 2 suggestions to review.')).toBeNull())
  })

  it('shows the Skills to build panel', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Skills to build' })).toBeTruthy()
    expect(await screen.findByText('Nothing to build yet')).toBeTruthy()
  })

  it('asks a signed-out visitor to sign in', () => {
    sessionState.status = 'unauthenticated'
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({ to: '/profile', reason: 'account' })
    expect(api.listEvidenceItems).not.toHaveBeenCalled()
  })

  it('keeps the loaded two-column layout while the facts reload, when this tab last saw suggestions (consistency-F10)', async () => {
    renderPage()
    // A load with suggestions: the page is two columns, and the tab remembers it.
    await screen.findByRole('list', { name: 'Suggestions to review' })
    expect(document.querySelector('.profile-layout')?.hasAttribute('data-split')).toBe(true)
    cleanup()

    // The next visit waits on the facts: the skeleton already has the suggestions column, so nothing jumps sideways.
    api.listEvidenceItems.mockReturnValue(new Promise(() => {}))
    renderPage()
    await waitFor(() => expect(document.querySelector('.profile-layout')?.hasAttribute('data-split')).toBe(true))
    expect(screen.getByRole('list', { name: 'Suggestions to review' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('list', { name: 'Saved facts' }).getAttribute('aria-busy')).toBe('true')
  })

  it.each(['loading', 'unreachable'])('waits with a placeholder, not a sign-in prompt, while the session is %s', (status) => {
    sessionState.status = status
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Saved facts' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(api.listEvidenceItems).not.toHaveBeenCalled()
  })

  it('leaves no empty line under a fact typed by hand with a single value', async () => {
    api.listEvidenceItems.mockResolvedValue({
      items: [makeItem({ id: 'k1', kind: 'skill', content: { name: 'Python' }, provenance: 'user-entered', confirmation_state: 'confirmed' })],
    })
    renderPage()

    const row = (await screen.findByText('Python')).closest('.kit-row') as HTMLElement
    expect(row.querySelector('.kit-row__subtitle')).toBeNull()
  })

  it('names what Delete profile removes: saved facts and suggestions, counted apart', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Delete profile/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('This permanently removes your one saved fact and 2 suggestions.')
    expect(dialog.textContent).not.toContain('all 3')
  })

  it('labels the trailing fields of a fact, so a focus area is not a bare word', async () => {
    api.listEvidenceItems.mockResolvedValue({
      items: [makeItem({
        id: 'i1',
        kind: 'interview-evidence',
        provenance: 'inferred',
        content: { question: 'Tell me about a rollout', answer: 'We moved 40 services.', focus_area: 'Kubernetes' },
      })],
    })
    renderPage()

    const suggestions = await screen.findByRole('list', { name: 'Suggestions to review' })
    expect(within(suggestions).getByText('Focus area: Kubernetes')).toBeTruthy()
    // An answer reads as its own line under the question.
    expect(within(suggestions).getByText('We moved 40 services.')).toBeTruthy()
  })
})
