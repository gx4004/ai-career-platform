import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolMutation } from '#/hooks/useToolMutation'
import { readWorkflowContext } from '#/lib/tools/drafts'
import type { ToolDraftState } from '#/lib/tools/drafts'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'

const navigateMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'guest' }) }))
vi.mock('#/components/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/components/kit')>()),
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
}))
vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))

const JOB = 'Senior Backend Engineer at Northwind Labs. Python, SQL, Kubernetes, CI/CD and on-call ownership.'
const RESUME = 'Built backend APIs with Python and SQL; owned deployments across three teams.'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function toolWith(id: ToolId, submit: () => Promise<Record<string, unknown>>) {
  return { ...tools[id], submit: vi.fn(submit) }
}

async function run(id: ToolId, draft: Partial<ToolDraftState>, result: Record<string, unknown> = {}) {
  const { result: hook, unmount } = renderHook(() => useToolMutation(toolWith(id, async () => result)), { wrapper })
  await act(async () => {
    await hook.current.mutateAsync({ payload: {}, draft: draft as ToolDraftState })
  })
  unmount()
}

describe('useToolMutation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateMock.mockReset()
    toastMock.mockReset()
  })
  afterEach(() => sessionStorage.clear())

  it('keeps the job description Job Match carried when Career Path (no job field) runs next', async () => {
    await run('job-match', { resumeText: RESUME, jobDescription: JOB })
    await run(
      'career',
      { resumeText: RESUME, targetRole: 'Platform Engineer' },
      { recommended_direction: { role_title: 'Platform Engineer' } },
    )

    const context = readWorkflowContext()
    expect(context?.jobDescription).toBe(JOB)
    expect(context?.targetRole).toBe('Platform Engineer')
    expect(context?.lastToolId).toBe('career')
  })

  it('still clears the job description when a tool that has the field is run with it empty', async () => {
    await run('job-match', { resumeText: RESUME, jobDescription: JOB })
    await run('resume', { resumeText: RESUME, jobDescription: '' })

    expect(readWorkflowContext()?.jobDescription).toBeUndefined()
  })

  it('goes to the result while the page is open', async () => {
    await run('career', { resumeText: RESUME, targetRole: 'Platform Engineer' })

    expect(navigateMock).toHaveBeenCalledWith({ to: expect.stringMatching(/^\/career\/result\//) })
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('leaves a user who moved on where they are and offers the result in a toast', async () => {
    let finish: (value: Record<string, unknown>) => void = () => {}
    const tool = toolWith('career', () => new Promise((resolve) => (finish = resolve)))
    const { result: hook, unmount } = renderHook(() => useToolMutation(tool), { wrapper })

    act(() => {
      hook.current.mutate({ payload: {}, draft: { resumeText: RESUME, targetRole: 'Platform Engineer' } as ToolDraftState })
    })
    await waitFor(() => expect(tool.submit).toHaveBeenCalled())
    unmount() // the user opened History from the sidebar
    window.history.replaceState(null, '', '/history')
    await act(async () => finish({}))

    await waitFor(() => expect(toastMock).toHaveBeenCalled())
    expect(navigateMock).not.toHaveBeenCalled()
    const options = toastMock.mock.calls[0][0]
    expect(options.title).toBe('Your Career Path result is ready')
    options.action.onClick()
    expect(navigateMock).toHaveBeenCalledWith({ to: expect.stringMatching(/^\/career\/result\//) })
    window.history.replaceState(null, '', '/')
  })
})
