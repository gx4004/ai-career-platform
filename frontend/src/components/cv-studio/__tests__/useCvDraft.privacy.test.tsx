import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CvDocument } from '#/lib/api/schemas'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'
import { LIST_KEY, useCvDraft } from '../useCvDraft'

const api = vi.hoisted(() => ({ listCvDocuments: vi.fn(), getCvDocument: vi.fn(), updateCvDocument: vi.fn(), getCvStyleCatalog: vi.fn() }))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/api/client')>(), ...api,
}))
const document: CvDocument = {
  id: 'private-cv', name: 'Private CV', sections: [],
  header: { name: 'Private Name', headline: null, email: null, phone: null, location: null, links: [] },
  style: { template_id: 'classic', font_id: null, accent_color: '#111827', density: 'normal', ats_mode: false, page_size: 'a4', fit_one_page: false },
  created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
  tailoring_model_runs: 0, tailoring_model_run_limit: 10, variants: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.getCvDocument.mockResolvedValue(document)
  api.getCvStyleCatalog.mockResolvedValue({})
})

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const hook = renderHook(() => useCvDraft(true), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  await waitFor(() => expect(hook.result.current.draft?.id).toBe(document.id))
  return { ...hook, client }
}

function expectCleared(client: QueryClient) {
  expect(client.getQueryData(['cv-studio', 'document', document.id])).toBeUndefined()
  expect(client.getQueryData(LIST_KEY)).toBeUndefined()
}

describe('CV work retired by privacy clearing', () => {
  it('does not flush a pending edit on logout unmount', async () => {
    const { result, unmount, client } = await mount()
    act(() => result.current.edit((draft) => ({ ...draft, name: 'Unsaved private edit' })))
    clearSensitiveBrowserData()
    unmount()
    client.clear()
    await act(async () => {})
    expect(api.updateCvDocument).not.toHaveBeenCalled()
    expectCleared(client)
  })

  it('does not restore cache when an in-flight save completes after logout', async () => {
    let finish!: (saved: CvDocument) => void
    api.updateCvDocument.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { result, unmount, client } = await mount()
    act(() => result.current.edit((draft) => ({ ...draft, name: 'Private edit' })))
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalled(), { timeout: 3000 })
    clearSensitiveBrowserData()
    unmount()
    client.clear()
    await act(async () => { finish({ ...document, name: 'Private edit' }) })
    expectCleared(client)
  })

  it('does not restore cache when a reload completes after logout', async () => {
    const { result, unmount, client } = await mount()
    let finish!: (saved: CvDocument) => void
    api.getCvDocument.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    let reload!: Promise<boolean>
    act(() => { reload = result.current.reloadNewer() })
    clearSensitiveBrowserData()
    unmount()
    client.clear()
    await act(async () => { finish(document); expect(await reload).toBe(false) })
    expectCleared(client)
  })
})
