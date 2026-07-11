import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const navigateMock = vi.hoisted(() => vi.fn())
const trackTelemetryMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'guest', openAuthDialog: vi.fn() }),
}))

vi.mock('#/components/app/PageFrame', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: trackTelemetryMock,
}))

vi.mock('#/lib/tools/resultDefinitions', () => ({
  resultDefinitions: new Proxy(
    {},
    {
      get: () => ({
        heroVariant: 'light',
        render: () => <div>RESULT_CONTENT_MARKER</div>,
        copyText: () => 'copied result',
      }),
    },
  ),
}))

function renderResult(nextStepTool?: 'career') {
  const item = setTransientResult('resume', { summary: { headline: 'Test headline' } })
  if (nextStepTool) item.metadata.next_step_tool = nextStepTool
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToolResultScreen toolId="resume" historyId={item.id} />
    </QueryClientProvider>,
  )
}

describe('ToolResultScreen — R7 next-best-action candidate', () => {
  beforeEach(() => {
    clearTransientResults()
    navigateMock.mockReset()
    trackTelemetryMock.mockReset()
  })

  afterEach(() => {
    clearTransientResults()
    vi.unstubAllEnvs()
  })

  it('leaves the result screen unchanged when its flag is off by default', () => {
    vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', undefined as unknown as string)
    renderResult()

    expect(screen.getByRole('heading', { name: 'Test headline' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Run again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Re-generate' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy result to clipboard' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /try next/i })).toBeNull()
    expect(screen.queryByLabelText('Try next suggestion')).toBeNull()
    expect(screen.getByText('RESULT_CONTENT_MARKER')).toBeTruthy()
    expect(trackTelemetryMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_name: 'workflow_continued' }),
    )
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('continues to the computed next tool and records the action when enabled', () => {
    vi.stubEnv('VITE_R7_NEXT_BEST_ACTION', 'true')
    renderResult('career')

    fireEvent.click(screen.getByRole('button', { name: 'Try next: Career Path' }))

    expect(trackTelemetryMock).toHaveBeenCalledWith({
      event_name: 'workflow_continued',
      tool_id: 'resume',
      access_mode: 'guest_demo',
    })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/career' })
  })
})
