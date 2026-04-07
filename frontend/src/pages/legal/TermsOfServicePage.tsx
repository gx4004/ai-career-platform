import { Link } from '@tanstack/react-router'
import { LegalLayout } from '#/components/legal/LegalLayout'
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER } from '#/components/legal/constants'

export function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service (“Terms”) govern your use of the Career Workbench web application (the “Service”)
        operated by {LEGAL_CONTROLLER}. By creating an account or using the Service, you agree to these Terms.
        If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Career Workbench is an AI-powered job-search workspace that helps you analyze your resume, match it with
        jobs, draft cover letters, practice interview questions, and plan your career. It is currently offered as a
        free thesis project, on an “as-is” and “as-available” basis, without any warranty. Features may change or
        be removed at any time.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 16 years old to use the Service. By using the Service you confirm that you meet this
        age requirement and that you have the legal capacity to enter into these Terms.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>You are responsible for providing accurate information when creating an account.</li>
        <li>You are responsible for keeping your password safe and for all activity under your account.</li>
        <li>Please notify us immediately at {LEGAL_CONTACT_EMAIL} if you suspect unauthorized access.</li>
        <li>You can delete your account at any time from the Settings page.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>When using the Service, you agree not to:</p>
      <ul>
        <li>upload other people’s personal data without a lawful basis or their consent;</li>
        <li>upload content that is illegal, defamatory, harassing, or infringes anyone’s rights;</li>
        <li>attempt to scrape, crawl, reverse-engineer, or otherwise abuse the Service;</li>
        <li>attempt to access other users’ accounts or data;</li>
        <li>use the Service to generate spam, fraud, or misleading job applications;</li>
        <li>interfere with the Service’s security or underlying infrastructure.</li>
      </ul>

      <h2>5. AI output disclaimer</h2>
      <p>
        The Service uses large language models (currently Google Vertex AI / Gemini) to generate suggestions,
        analyses, and written content. AI output can be inaccurate, incomplete, biased, or outdated. You are
        responsible for reviewing and verifying everything before you rely on it.
      </p>
      <p>
        <strong>
          Nothing produced by the Service is professional career, legal, medical, psychological, or financial advice.
          We make no guarantee that using the Service will lead to an interview, a job offer, or any particular
          career outcome.
        </strong>
      </p>

      <h2>6. Your content and intellectual property</h2>
      <p>
        You own the content you upload to the Service (for example, your resume). By uploading it, you grant us a
        limited, non-exclusive, worldwide, royalty-free license to store, process, transmit, and display that
        content solely for the purpose of providing the Service to you, including sending it to our AI and
        infrastructure sub-processors as described in the{' '}
        <Link to="/privacy" className="legal-page__link">
          Privacy Policy
        </Link>
        .
      </p>
      <p>
        The Service itself, including its code, design, and branding, is owned by {LEGAL_CONTROLLER}. You may not
        copy, modify, or redistribute it without permission.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service relies on third-party providers (Google, Sentry, Resend, Railway). Your use of features powered
        by those providers may also be governed by their own terms and privacy policies. We are not responsible for
        the content or practices of third-party services.
      </p>

      <h2>8. No warranty</h2>
      <p>
        The Service is provided “as is” and “as available”, without warranties of any kind, whether express or
        implied, including warranties of merchantability, fitness for a particular purpose, accuracy, or
        non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {LEGAL_CONTROLLER} shall not be liable for any indirect, incidental,
        consequential, special, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising
        from or relating to your use of the Service. Because the Service is provided free of charge, our total
        aggregate liability to you is limited to zero euros (€0).
      </p>
      <p>
        Nothing in these Terms limits any liability that cannot be excluded under Polish or EU law (for example,
        liability for gross negligence, wilful misconduct, or statutory consumer rights).
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time if you breach these Terms or if we need
        to protect the Service or other users. You can stop using the Service and delete your account at any time.
      </p>

      <h2>11. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Republic of Poland, without regard to its conflict-of-law rules.
        Disputes shall be submitted to the competent courts in Poland, subject to any mandatory consumer protection
        rules in your country of residence.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The “Last updated” date at the top of this page shows when it
        was last changed. If the changes are material, we will notify you in the app or by email. Your continued use
        of the Service after changes take effect constitutes acceptance of the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Email us at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
