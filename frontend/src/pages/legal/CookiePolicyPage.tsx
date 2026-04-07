import { Link } from '@tanstack/react-router'
import { LegalLayout, LEGAL_CONTACT_EMAIL } from '#/components/legal/LegalLayout'

function resetConsent() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('cw-cookie-consent')
    window.location.reload()
  } catch {
    /* ignore */
  }
}

export function CookiePolicyPage() {
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
      <div className="legal-page__table-wrap">
        <table className="legal-page__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Purpose</th>
              <th>Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>cw_access</code>
              </td>
              <td>HttpOnly cookie</td>
              <td>Short-lived authentication token used to keep you signed in.</td>
              <td>~30 minutes</td>
            </tr>
            <tr>
              <td>
                <code>cw_refresh</code>
              </td>
              <td>HttpOnly cookie</td>
              <td>Refresh token used to renew your session without signing in again.</td>
              <td>~7 days</td>
            </tr>
            <tr>
              <td>
                <code>cw-cookie-consent</code>
              </td>
              <td>localStorage</td>
              <td>Remembers your cookie-consent choice so we don’t show the banner again.</td>
              <td>Until you clear it</td>
            </tr>
            <tr>
              <td>
                <code>cw:sw-reload-pending</code>
              </td>
              <td>sessionStorage</td>
              <td>Technical flag used to reload the page after a service-worker update.</td>
              <td>Until the browser tab is closed</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>3. Analytics and advertising cookies</h2>
      <p>
        <strong>Right now, Career Workbench does not load any analytics or advertising cookies.</strong> No Google
        Analytics, Plausible, PostHog, Meta Pixel, or similar trackers are active.
      </p>
      <p>
        In the future we may enable Google AdSense to support the free tier. If and when that happens, AdSense will
        load only <em>after</em> you accept cookies, and Google may then set advertising cookies on your device. You
        can read more in{' '}
        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer" className="legal-page__link">
          Google’s ads policy
        </a>
        .
      </p>

      <h2>4. Error monitoring (Sentry)</h2>
      <p>
        When something crashes in the app, we send a diagnostic event to Sentry to help us fix the bug. Sentry does
        not set tracking cookies for this; it is triggered only on errors and uses a minimal payload. See Sentry’s{' '}
        <a href="https://sentry.io/privacy/" target="_blank" rel="noreferrer" className="legal-page__link">
          privacy policy
        </a>{' '}
        for details.
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
        <button type="button" className="legal-page__reset-btn" onClick={resetConsent}>
          Reset cookie consent
        </button>
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
