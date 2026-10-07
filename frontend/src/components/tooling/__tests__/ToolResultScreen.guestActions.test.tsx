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
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Link: ({ to, children, activeOptions: _active, ...props }: { to: string; children: React.ReactNode; activeOptions?: unknown }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'guest', openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: trackTelemetryMock }))

vi.mock('#/lib/tools/resultDefinitions', () => ({
  FixFirstList: () => null,
  resultDefinitions: new Proxy(
    {},
    {
      get: () => ({
        summary: () => ({ facts: [] }),
        topActions: () => [],
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

  it('tells a guest the result is not saved and offers a free account, without a next-best-action card', () => {
    renderResumeResult()

    expect(screen.getByText('This result is not saved')).toBeTruthy()
    expect(screen.getByText(/Create a free account and your next runs are saved/)).toBeTruthy()
    expect(screen.queryByText(/Resume Analyzer result/)).toBeNull()
    expect(screen.queryByRole('button', { name: /try next/i })).toBeNull()
    expect(screen.queryByLabelText('Try next suggestion')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
    // The create-account prompt asks for the register view.
    expect(openAuthDialogMock).toHaveBeenCalledWith({
      to: '/resume',
      reason: 'guest-demo-result',
      label: 'Create account',
      toolId: 'resume',
      view: 'register',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenLastCalledWith({
      to: '/resume',
      reason: 'guest-demo-result',
      label: 'Sign in',
      toolId: 'resume',
    })
  })

  it('opens the sign-in prompt when a guest clicks the star', () => {
    renderResumeResult()
    const star = screen.getByRole('button', { name: 'Star this result: sign in first' })
    expect(star.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(star)
    expect(openAuthDialogMock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'save-demo-result', toolId: 'resume' }))
  })

  it('suggests the registry next tools at the end of the report', () => {
    renderResumeResult()
    const list = screen.getByRole('list', { name: 'What next' })
    expect(list.textContent).toContain('Compare it to a role')
    expect(screen.getByRole('link', { name: 'Open Job Match' }).getAttribute('href')).toBe('/job-match')
    expect(screen.getByRole('link', { name: 'Open Portfolio Planner' }).getAttribute('href')).toBe('/portfolio')
  })
})
