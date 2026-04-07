import { Link } from '@tanstack/react-router'
import { LegalLayout } from '#/components/legal/LegalLayout'
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER } from '#/components/legal/constants'

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL_CONTROLLER} (“we”, “us”, “our”) collects, uses, and protects your
        personal data when you use the Career Workbench web application (the “Service”). We are committed to
        complying with the EU General Data Protection Regulation (GDPR) and Polish data protection law.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The data controller is <strong>{LEGAL_CONTROLLER}</strong>, operated as a student thesis project based in
        Poland. You can contact us about any privacy matter at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2>2. What data we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> email address, full name (optional), and a Google account identifier if you
          sign in with Google. If you create a password-based account, we store a hashed version of your password
          (never the plaintext).
        </li>
        <li>
          <strong>Content data:</strong> the resumes, job descriptions, cover letters, interview answers, career
          preferences, and any other content you upload or generate while using the Service. This content is stored
          with your account so you can revisit past runs.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, browser type, device information, and error diagnostics
          collected automatically when something goes wrong in the app (via Sentry).
        </li>
        <li>
          <strong>Cookies and similar storage:</strong> strictly-necessary authentication cookies and a local
          preference that remembers your cookie-consent choice. See the{' '}
          <Link to="/cookies" className="legal-page__link">
            Cookie Policy
          </Link>{' '}
          for details.
        </li>
      </ul>

      <h2>3. How we use your data and legal basis</h2>
      <ul>
        <li>
          <strong>Providing the Service (Art. 6(1)(b) GDPR — contract):</strong> creating your account, letting you
          sign in, running the AI tools you request, and storing your results so you can return to them.
        </li>
        <li>
          <strong>Security and bot protection (Art. 6(1)(f) GDPR — legitimate interest):</strong> preventing abuse and
          automated attacks through Google reCAPTCHA.
        </li>
        <li>
          <strong>Error monitoring (Art. 6(1)(f) GDPR — legitimate interest):</strong> understanding and fixing crashes
          and bugs via Sentry.
        </li>
        <li>
          <strong>Transactional email (Art. 6(1)(b) GDPR — contract):</strong> sending password-reset emails through
          Resend.
        </li>
        <li>
          <strong>Advertising (Art. 6(1)(a) GDPR — consent):</strong> if we enable Google AdSense in the future, it
          will only load after you accept cookies. It is not active today.
        </li>
      </ul>

      <h2>4. AI processing of your content</h2>
      <p>
        To generate resume analyses, job matches, cover letters, interview feedback, and similar outputs, we send the
        content you provide (such as your resume text and the job description) to{' '}
        <strong>Google Vertex AI (Gemini)</strong>. Google processes this content on our behalf as a sub-processor.
        You should not upload information you do not want to send to Google’s AI service. Please do not include highly
        sensitive data such as national IDs, health data, or payment information in your inputs.
      </p>

      <h2>5. Who we share data with (sub-processors)</h2>
      <p>We use the following third-party providers to run the Service:</p>
      <ul>
        <li>
          <strong>Google Cloud (Vertex AI / Gemini)</strong> — AI processing of your content.{' '}
          <a href="https://cloud.google.com/terms/cloud-privacy-notice" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy notice
          </a>
        </li>
        <li>
          <strong>Google (OAuth)</strong> — optional sign-in with your Google account.{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>Google reCAPTCHA</strong> — bot protection on sensitive forms.{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>Google AdSense</strong> — advertising (only if enabled in the future and only with your consent).{' '}
          <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer" className="legal-page__link">
            Ads policy
          </a>
        </li>
        <li>
          <strong>Sentry</strong> — error monitoring.{' '}
          <a href="https://sentry.io/privacy/" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>Resend</strong> — transactional email (password resets).{' '}
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>Railway</strong> — application hosting and managed PostgreSQL database.{' '}
          <a href="https://railway.com/legal/privacy" target="_blank" rel="noreferrer" className="legal-page__link">
            Privacy policy
          </a>
        </li>
      </ul>
      <p>
        We do not sell your personal data and we do not share it with third parties for their own marketing purposes.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Some of our sub-processors (notably Google and Sentry) process data in the United States or other countries
        outside the European Economic Area. Where this happens, transfers are protected by the European Commission’s
        Standard Contractual Clauses and, where applicable, supplementary measures required under GDPR.
      </p>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>
          <strong>Account data</strong> is kept for as long as your account exists. If you delete your account, we
          delete your profile and associated tool runs.
        </li>
        <li>
          <strong>Content data (tool runs)</strong> is kept until you delete it or until you delete your account.
        </li>
        <li>
          <strong>Error logs</strong> in Sentry are retained according to Sentry’s default retention policy (currently
          up to 90 days for most events).
        </li>
      </ul>

      <h2>8. Your rights under GDPR</h2>
      <p>You have the right to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>request correction of inaccurate data;</li>
        <li>request deletion of your data (“right to be forgotten”);</li>
        <li>request restriction or object to certain processing;</li>
        <li>request a portable copy of your data;</li>
        <li>withdraw consent at any time (for example, by declining or resetting cookies);</li>
        <li>
          lodge a complaint with your local data protection authority. In Poland this is the President of the
          Personal Data Protection Office (UODO){' '}
          <a href="https://uodo.gov.pl/" target="_blank" rel="noreferrer" className="legal-page__link">
            uodo.gov.pl
          </a>
          .
        </li>
      </ul>
      <p>
        To exercise any of these rights, email us at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
          {LEGAL_CONTACT_EMAIL}
        </a>
        . We will respond within one month.
      </p>

      <h2>9. Security</h2>
      <p>
        We use HTTPS for all traffic, store passwords only as bcrypt hashes, keep authentication tokens in
        HttpOnly cookies, and rely on Railway’s managed infrastructure for database security. No system is perfectly
        secure, so please use a strong, unique password.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not intended for children under 16. If you are under 16, please do not use the Service or
        provide us with any personal data.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Last updated” date at the top of this page shows
        when it was last changed. Material changes will be announced in the app or by email.
      </p>
    </LegalLayout>
  )
}
