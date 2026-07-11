import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { clearPendingIntent, writePendingIntent } from '#/lib/auth/pendingIntent'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

const openAuthDialogMock = vi.hoisted(() => vi.fn())
const registerMock = vi.hoisted(() => vi.fn())
const trackTelemetryMock = vi.hoisted(() => vi.fn())

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'guest',
    openAuthDialog: openAuthDialogMock,
    register: registerMock,
    googleLogin: vi.fn(),
    authError: '',
  }),
}))

vi.mock('#/components/app/PageFrame', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: trackTelemetryMock }))

vi.mock('#/lib/tools/resultDefinitions', () => ({
  resultDefinitions: new Proxy({}, {
    get: () => ({
      heroVariant: 'light',
      render: () => <div>RESULT_CONTENT_MARKER</div>,
      copyText: () => 'copied result',
    }),
  }),
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

describe('ToolResultScreen — R7 value-specific signup candidate', () => {
  beforeEach(() => {
    clearTransientResults()
    openAuthDialogMock.mockReset()
    registerMock.mockReset().mockResolvedValue(undefined)
    trackTelemetryMock.mockReset()
    localStorageMock.clear()
    openAuthDialogMock.mockImplementation((intent) => {
      writePendingIntent({ ...intent, createdAt: Date.now() })
    })
  })

  afterEach(() => {
    clearTransientResults()
    clearPendingIntent()
    vi.unstubAllEnvs()
  })

  it('preserves the existing guest prompt copy and behavior when off by default', () => {
    vi.stubEnv('VITE_R7_VALUE_SPECIFIC_SIGNUP', undefined as unknown as string)
    renderResumeResult()

    expect(screen.getByText('Guest demo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText(/Resume Analyzer result/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({
      to: '/resume',
      reason: 'guest-demo-result',
      label: 'Sign in',
      toolId: 'resume',
    })
  })

  it('names the specific result and attributes signup completion when enabled', async () => {
    vi.stubEnv('VITE_R7_VALUE_SPECIFIC_SIGNUP', 'true')
    renderResumeResult()

    expect(screen.getByText('Keep your Resume Analyzer result')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to save your Resume Analyzer result' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({
      to: '/resume',
      reason: 'guest-demo-result',
      label: 'Sign in to save your Resume Analyzer result',
      toolId: 'resume',
    })

    render(<RegisterForm />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new.user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'sufficiently-long-pass' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(trackTelemetryMock).toHaveBeenCalledWith({
      event_name: 'auth_signup_source',
      tool_id: 'resume',
    }))
  })
})
