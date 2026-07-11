import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceProposal } from '#/lib/api/schemas'
import { ResumeImportDialog } from '#/components/profile/ResumeImportDialog'

const requestProposalsMock = vi.hoisted(() => vi.fn())
const createItemMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  requestEvidenceImportProposals: requestProposalsMock,
  createEvidenceItem: createItemMock,
}))

function proposal(overrides: Partial<EvidenceProposal>): EvidenceProposal {
  return {
    proposal_id: 'p1',
    kind: 'experience',
    content: { role: 'Backend Engineer', employer: 'Synthetic Corp' },
    provenance: 'imported',
    ...overrides,
  }
}

const RESUME = 'a'.repeat(80)

function renderDialog(onImported = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ResumeImportDialog
        open
        resumeText={RESUME}
        onOpenChange={onOpenChange}
        onImported={onImported}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange, onImported }
}

describe('ResumeImportDialog', () => {
  beforeEach(() => {
    requestProposalsMock.mockReset().mockResolvedValue({
      proposals: [
        proposal({ proposal_id: 'p1', kind: 'experience' }),
        proposal({ proposal_id: 'p2', kind: 'skill', content: { name: 'TypeScript' } }),
      ],
    })
    createItemMock.mockReset().mockResolvedValue({ id: 'new' })
  })

  it('requests proposals from the resume and lists them for review', async () => {
    renderDialog()
    await screen.findByText('Backend Engineer')
    expect(requestProposalsMock).toHaveBeenCalledWith(RESUME)
    expect(screen.getByText('TypeScript')).toBeTruthy()
  })

  it('accepts a proposal as an imported item and refreshes the profile', async () => {
    const { onImported } = renderDialog()
    const first = (await screen.findByText('Backend Engineer')).closest('li') as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: /Accept/i }))

    await waitFor(() =>
      expect(createItemMock).toHaveBeenCalledWith({
        kind: 'experience',
        content: { role: 'Backend Engineer', employer: 'Synthetic Corp' },
        provenance: 'imported',
      }),
    )
    await waitFor(() => expect(onImported).toHaveBeenCalled())
  })

  it('discards a proposal purely client-side with no server write', async () => {
    renderDialog()
    const first = (await screen.findByText('Backend Engineer')).closest('li') as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: /Discard/i }))

    await waitFor(() => expect(screen.queryByText('Backend Engineer')).toBeNull())
    // Discarding never touches the create path — no server-side trace.
    expect(createItemMock).not.toHaveBeenCalled()
  })

  it('edits a proposal before accepting and sends the edited content', async () => {
    renderDialog()
    const first = (await screen.findByText('Backend Engineer')).closest('li') as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: /Edit/i }))

    const editor = await screen.findByLabelText('Proposal content (JSON fields)')
    fireEvent.change(editor, { target: { value: '{"role":"Staff Engineer"}' } })
    fireEvent.click(screen.getByRole('button', { name: /Save edit/i }))

    const edited = (await screen.findByText('Staff Engineer')).closest('li') as HTMLElement
    fireEvent.click(within(edited).getByRole('button', { name: /Accept/i }))

    await waitFor(() =>
      expect(createItemMock).toHaveBeenCalledWith({
        kind: 'experience',
        content: { role: 'Staff Engineer' },
        provenance: 'imported',
      }),
    )
  })

  it('skipping closes the dialog without writing anything', async () => {
    const { onOpenChange } = renderDialog()
    await screen.findByText('Backend Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(createItemMock).not.toHaveBeenCalled()
  })

  it('shows an empty state when no evidence is extractable', async () => {
    requestProposalsMock.mockResolvedValue({ proposals: [] })
    renderDialog()
    await screen.findByText(/No reusable evidence was found/i)
    expect(createItemMock).not.toHaveBeenCalled()
  })
})
