import { Link } from '@tanstack/react-router'
import { LegalLayout, LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER } from '#/components/legal/LegalLayout'

export function ImprintPage() {
  return (
    <LegalLayout title="Imprint">
      <p>
        This page provides basic information about the operator of Career Workbench, as a courtesy to visitors from
        jurisdictions where an imprint is expected.
      </p>

      <h2>Operator</h2>
      <p>
        <strong>{LEGAL_CONTROLLER}</strong>
        <br />
        Operated as a student thesis project based in Poland.
      </p>

      <h2>Contact</h2>
      <p>
        Email:{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
          {LEGAL_CONTACT_EMAIL}
        </a>
      </p>

      <h2>Responsible for content</h2>
      <p>
        The operator of Career Workbench is responsible for the content of this website. User-generated content
        (such as resumes, job descriptions, and outputs produced by AI tools) belongs to the respective users.
      </p>

      <h2>Legal documents</h2>
      <ul>
        <li>
          <Link to="/privacy" className="legal-page__link">
            Privacy Policy
          </Link>
        </li>
        <li>
          <Link to="/terms" className="legal-page__link">
            Terms of Service
          </Link>
        </li>
        <li>
          <Link to="/cookies" className="legal-page__link">
            Cookie Policy
          </Link>
        </li>
      </ul>

      <h2>Disclaimer</h2>
      <p>
        Career Workbench is provided on an “as-is” basis. AI-generated output is not professional career, legal,
        medical, or financial advice. See the{' '}
        <Link to="/terms" className="legal-page__link">
          Terms of Service
        </Link>{' '}
        for details.
      </p>
    </LegalLayout>
  )
}
