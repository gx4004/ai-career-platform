import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    const skills = await screen.findByRole('list', { name: 'Skills' })
    expect(within(skills).getByText('TypeScript')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Experience' })).toBeNull()
    expect(screen.getAllByText('Backend Engineer')).toHaveLength(1)
  })

  it('saves a suggestion with its one primary action', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save: Backend Engineer' }))

    await waitFor(() => expect(api.confirmEvidenceItem).toHaveBeenCalledWith('e1'))
  })

  it('tells the owner when saving a suggestion fails', async () => {
    api.confirmEvidenceItem.mockRejectedValueOnce(new Error('Could not save.'))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save: Backend Engineer' }))

    // The toast provider keeps its own empty alert region, so look at what every alert says.
    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((node) => node.textContent).join(' ')).toContain('Could not save.'),
    )
  })

  it('dismissing a suggestion inline deletes it', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss: Backend Engineer' }))

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

  it('will not add an empty fact', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a fact' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save fact' }))

    expect(await within(dialog).findByText('Write the fact first.')).toBeTruthy()
    expect(api.createEvidenceItem).not.toHaveBeenCalled()
  })

  it('offers Download my data beside Delete profile', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Download my data/ }))
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

  it('edits a saved fact through one labelled field per value', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit: TypeScript' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'TypeScript, React' } })
    fireEvent.change(within(dialog).getByLabelText('Level'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.updateEvidenceItem).toHaveBeenCalledWith('s1', { content: { name: 'TypeScript, React' } }),
    )
  })

  it('deletes a saved fact through the confirm dialog and refreshes warm caches', async () => {
    renderPage()
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete: TypeScript' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete fact/ }))

    await waitFor(() => expect(api.deleteEvidenceItem).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
  })

  it('deletes the whole profile through the bulk endpoint', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Delete profile/ }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete everything/ }))

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
})
