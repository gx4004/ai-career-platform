import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CampaignPage } from '../CampaignPage'

const api = vi.hoisted(() => ({ getCampaign: vi.fn(), updateCampaignMaterials: vi.fn() }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/history">{children}</a> }))

const campaign = {
  id: 'ws-1', label: 'Northstar', is_pinned: false, company: 'Northstar Labs', role: 'Platform Engineer', status: 'preparing', deadline: '2026-08-15T16:00:00Z', linked_run_ids: [], last_active_tool: null, last_active_result_id: null, updated_at: '2026-07-13T10:00:00Z',
  listing: { title: 'Platform Engineer', company: 'Northstar Labs', description: 'Own the service platform and improve reliability across product teams.', source_url: 'https://jobs.example/platform', retrieved_at: '2026-07-12T10:00:00Z' },
  selected_materials: { cv_variant: null, cover_letter: null, interview: null },
  available_materials: { cv_variants: [{ id: 'cv-1', document_id: 'doc-1', document_name: 'Engineering CV', name: 'Northstar', target_role: 'Platform Engineer', created_at: '2026-07-12T10:00:00Z' }], cover_letters: [{ id: 'cl-2', label: 'Northstar letter', parent_run_id: 'cl-1', created_at: '2026-07-12T11:00:00Z' }], interviews: [] },
}

function renderPage() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><CampaignPage campaignId="ws-1" /></QueryClientProvider>) }

describe('CampaignPage', () => {
  it('shows campaign facts, canonical listing, and immutable material choices', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    api.updateCampaignMaterials.mockImplementation(async (_id, payload) => ({ ...campaign, selected_materials: { ...campaign.selected_materials, cv_variant: payload.cv_variant_id ? campaign.available_materials.cv_variants[0] : null } }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
    expect(screen.getAllByText('Northstar Labs')).toHaveLength(2)
    expect(screen.getByText(/Own the service platform/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('CV variant'), { target: { value: 'cv-1' } })
    await waitFor(() => expect(api.updateCampaignMaterials).toHaveBeenCalledWith('ws-1', { cv_variant_id: 'cv-1' }))
    expect(screen.getByRole('option', { name: /Northstar letter — revision.*cl-2/ })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toBe('Selection saved.')
  })

  it('renders an explicit empty state and disables unavailable material selection', async () => {
    api.getCampaign.mockResolvedValue({ ...campaign, listing: null, available_materials: { cv_variants: [], cover_letters: [], interviews: [] } })
    renderPage()
    expect(await screen.findByText('No canonical listing yet')).toBeTruthy()
    expect((screen.getByLabelText('Interview preparation revision') as HTMLSelectElement).disabled).toBe(true)
  })
})
