import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsentState } from '#/lib/consent'
import { CONSENT_STORAGE_KEY } from '#/lib/consent'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { clearTransientResults, setTransientResult } from '#/lib/tools/demoRuns'

// R9 #127: prove the dormant client ad gate is gone. Mounting a result must add
// no advertising script and show no monetization UI, regardless of the visitor's
// cookie-consent state, while still exposing the full result content and export
// affordances (guest and authenticated).

const navigateMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'guest'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/components/app/PageFrame', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: vi.fn(),
}))

// A trivial result definition so the test is robust against per-tool payload
// shape — the wrapper (formerly `AdGatedLock`) is what is under test, not the
// per-tool renderer. `download` makes an export affordance render in the hero.
vi.mock('#/lib/tools/resultDefinitions', () => ({
  resultDefinitions: new Proxy(
    {},
    {
      get: () => ({
        heroVariant: 'light',
        render: () => <div>RESULT_CONTENT_MARKER</div>,
        copyText: () => 'copied result',
        download: () => ({ filename: 'result.txt', content: 'result body' }),
      }),
    },
  ),
}))

function renderResult() {
  const item = setTransientResult('resume', { summary: { headline: 'Test headline' } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToolResultScreen toolId="resume" historyId={item.id} />
    </QueryClientProvider>,
  )
  return item
}

// The repo's jsdom `localStorage` does not expose working methods (see the
// telemetry client test, which stubs it for the same reason). Back it with a Map.
const consentStore = new Map<string, string>()

function setConsent(state: ConsentState) {
  consentStore.clear()
  if (state !== 'pending') consentStore.set(CONSENT_STORAGE_KEY, state)
}

describe('ToolResultScreen — dormant ad gate removed (R9 #127)', () => {
  beforeEach(() => {
    sessionStatus = 'guest'
    navigateMock.mockReset()
    openAuthDialogMock.mockReset()
    clearTransientResults()
    consentStore.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => consentStore.get(key) ?? null,
      setItem: (key: string, value: string) => consentStore.set(key, value),
      removeItem: (key: string) => consentStore.delete(key),
      clear: () => consentStore.clear(),
    })
    // Nothing should inject this; guard the transport so telemetry/ad code
    // paths cannot fail the render for an unrelated reason.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
  })

  afterEach(() => {
    clearTransientResults()
    consentStore.clear()
    vi.unstubAllGlobals()
    // Remove any script a regression might have injected so cases stay isolated.
    document.querySelectorAll('script[src*="adsbygoogle"]').forEach((n) => n.remove())
  })

  const consentStates: ConsentState[] = ['pending', 'accepted', 'rejected']

  it.each(consentStates)(
    'mounts no advertising script and no monetization UI for %s consent (guest)',
    (consent) => {
      setConsent(consent)
      renderResult()

      // Full content and an export affordance are present.
      expect(screen.getByText('RESULT_CONTENT_MARKER')).toBeTruthy()
      expect(screen.getByLabelText(/Download result/i)).toBeTruthy()

      // No advertising vendor script was injected in any consent state.
      expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
      expect(document.querySelector('script[src*="googlesyndication"]')).toBeNull()

      // No ad-gate / countdown / unlock UI.
      expect(document.querySelector('.ad-gate-card')).toBeNull()
      expect(document.querySelector('.ad-countdown')).toBeNull()
      expect(screen.queryByText(/Unlock full results/i)).toBeNull()
      expect(screen.queryByText(/Watch a short ad/i)).toBeNull()
      expect(screen.queryByText(/unlocking in/i)).toBeNull()
    },
  )

  it.each(consentStates)(
    'mounts no advertising script and no monetization UI for %s consent (authenticated)',
    (consent) => {
      sessionStatus = 'authenticated'
      setConsent(consent)
      renderResult()

      expect(screen.getByText('RESULT_CONTENT_MARKER')).toBeTruthy()
      expect(screen.getByLabelText(/Download result/i)).toBeTruthy()
      expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
      expect(document.querySelector('.ad-gate-card')).toBeNull()
      expect(screen.queryByText(/Unlock full results/i)).toBeNull()
    },
  )
})
