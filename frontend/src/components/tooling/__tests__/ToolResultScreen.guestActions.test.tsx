import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const openAuthDialogMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const trackTelemetryMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'guest', openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/components/app/PageFrame', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: trackTelemetryMock }))

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

function renderResumeResult() {
  const item = setTransientResult('resume', { summary: { headline: 'Test headline' } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToolResultScreen toolId="resume" historyId={item.id} />
    </QueryClientProvider>,
  )
}

describe('ToolResultScreen — guest banner and result actions', () => {
  beforeEach(() => {
    clearTransientResults()
    openAuthDialogMock.mockReset()
    navigateMock.mockReset()
    trackTelemetryMock.mockReset()
  })

  it('shows the generic guest prompt and no next-best-action suggestion', () => {
    renderResumeResult()

    expect(screen.getByText('Guest demo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText(/Resume Analyzer result/)).toBeNull()
    expect(screen.queryByRole('button', { name: /try next/i })).toBeNull()
    expect(screen.queryByLabelText('Try next suggestion')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({
      to: '/resume',
      reason: 'guest-demo-result',
      label: 'Sign in',
      toolId: 'resume',
    })
  })
})
