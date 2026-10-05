import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, Table, useToast } from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { LegalLayout } from '#/components/legal/LegalLayout'
import { StorageInventory } from '#/components/legal/StorageInventory'
import { LEGAL_CONTACT_EMAIL } from '#/components/legal/constants'
import { clearStoredConsent } from '#/lib/consent'

type CookieRow = { name: string; type: string; purpose: string; lifetime: string }

const NECESSARY_COOKIES: CookieRow[] = [
  {
    name: 'cw_access',
    type: 'HttpOnly cookie',
    purpose: 'Short-lived authentication token used to keep you signed in.',
    lifetime: '~30 minutes',
  },
  {
    name: 'cw_refresh',
    type: 'HttpOnly cookie',
    purpose: 'Refresh token used to renew your session without signing in again.',
    lifetime: '~7 days',
  },
  {
    name: 'cw-cookie-consent',
    type: 'localStorage',
    purpose: 'Remembers your cookie-consent choice so we don’t show the banner again.',
    lifetime: 'Until you clear it',
  },
  {
    name: 'cw:sw-reload-pending',
    type: 'sessionStorage',
    purpose: 'Technical flag used to reload the page after a service-worker update.',
    lifetime: 'Until the browser tab is closed',
  },
]

const COOKIE_COLUMNS: TableColumn<CookieRow>[] = [
  { id: 'name', header: 'Name', primary: true, cell: (cookie) => <code>{cookie.name}</code> },
  { id: 'type', header: 'Type', cell: (cookie) => cookie.type },
  { id: 'purpose', header: 'Purpose', cell: (cookie) => cookie.purpose },
  { id: 'lifetime', header: 'Lifetime', cell: (cookie) => cookie.lifetime },
]

export function CookiePolicyPage() {
  const { toast } = useToast()
  // Bumped after a reset so the live table of stored keys is read again.
  const [inventoryVersion, setInventoryVersion] = useState(0)

  function resetConsent() {
    clearStoredConsent()
    setInventoryVersion((version) => version + 1)
    toast({
      tone: 'success',
      title: 'Cookie consent reset',
      description: "We'll ask again the next time you visit.",
    })
  }

  return (
    <LegalLayout title="Cookie Policy">
      <p>
        This Cookie Policy explains how Career Workbench uses cookies and similar technologies. Read it alongside
        our{' '}
        <Link to="/privacy" className="legal-page__link">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files that a website stores on your device. We also use browser storage APIs
        (localStorage and sessionStorage), which behave similarly. In the rest of this page we refer to all of them
        as “cookies”.
      </p>

      <h2>2. Strictly necessary cookies we set</h2>
      <p>
        These cookies are required to operate the Service. They are always set and do not require your consent
        under the ePrivacy Directive.
      </p>
      <Table
        caption="Strictly necessary cookies"
        columns={COOKIE_COLUMNS}
        rows={NECESSARY_COOKIES}
        getRowId={(cookie) => cookie.name}
      />

      <h3>What this browser holds right now</h3>
      <p>
        The strictly necessary list above is what we always set. This table is read from your browser as you open
        the page, so it also shows the preferences and in-tab working data the app keeps, and the sign-in cookies
        above are missing from it because browsers hide HttpOnly cookies from page scripts. Values are never shown.
      </p>
      <StorageInventory version={inventoryVersion} />

      <h2>3. Analytics and advertising cookies</h2>
      <p>
        <strong>Right now, Career Workbench does not load any analytics or advertising cookies.</strong> No Google
        Analytics, Plausible, PostHog, Meta Pixel, or similar third-party trackers are active in the V1 thesis demo.
      </p>
      <p>
        We do collect a small amount of first-party diagnostic telemetry to monitor whether the tools complete
        successfully (event names like <code>tool_run_started</code>, <code>tool_run_succeeded</code>,
        <code>frontend_error</code>). The payload contains the tool ID, access mode (guest or authenticated),
        completion status, bounded durations (including when a pending generation loader is left), and
        low-cardinality failure categories, never routes, raw error messages, history/workspace
        identifiers, resume text, job descriptions, or generated content. This telemetry runs through our own backend
        and is suppressed when you decline cookies.
      </p>
      <p>
        Career Workbench does not serve advertising and sets no advertising cookies. There is no ad code in the
        application. If we ever introduce advertising or another paid tier, we will update this policy first and load
        any advertising vendor only <em>after</em> you give affirmative, purpose-specific consent — never on the basis
        of a pending or assumed choice.
      </p>

      <h2>4. Error monitoring</h2>
      <p>
        We do not use a third-party error-monitoring service. Crashes and bugs are diagnosed from our own
        first-party logs and the diagnostic telemetry described above, and no third-party service sets cookies
        for this purpose.
      </p>

      <h2>5. Managing cookies</h2>
      <p>You control cookies in two places:</p>
      <ul>
        <li>
          <strong>In your browser:</strong> every major browser lets you block or delete cookies. See{' '}
          <a href="https://www.aboutcookies.org/" target="_blank" rel="noreferrer" className="legal-page__link">
            aboutcookies.org
          </a>{' '}
          for guides. Blocking strictly-necessary cookies will sign you out.
        </li>
        <li>
          <strong>In Career Workbench:</strong> you can reset your cookie-consent choice below. The consent banner
          will reappear the next time you visit.
        </li>
      </ul>
      <p>
        <Button variant="secondary" size="sm" onClick={resetConsent}>
          Reset cookie consent
        </Button>
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions? Email{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
