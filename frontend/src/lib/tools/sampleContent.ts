/**
 * R7 candidate #111 — synthetic sample content for the "try a sample" quick-fill.
 *
 * This is fully hand-authored, synthetic placeholder content that never touched a
 * real user (D-041 / ADR-0002 synthetic-content discipline): no real names,
 * emails, phone numbers, or employers. It uses the canonical fictitious companies
 * (Contoso, Fabrikam, Northwind) and an example.com address, and each blob opens
 * with an explicit "SAMPLE" marker so it is obvious in the UI that this is demo
 * content, not the user's own resume or job description.
 *
 * Only used behind the default-off `VITE_R7_SAMPLE_QUICKFILL` flag
 * (`isR7SampleQuickfillEnabled`). When the flag is off, this content is never
 * rendered or seeded anywhere.
 */

/** Clearly-synthetic sample resume, seeded into the resume paste-text path. */
export const SAMPLE_RESUME_TEXT = `SAMPLE RESUME — synthetic example, not a real person.

Alex Sample
Frontend Engineer
alex.sample@example.com | Sampleton, Anywhere | portfolio: example.com/alex-sample

SUMMARY
Frontend engineer with 5 years building accessible, performant web apps in React
and TypeScript. Comfortable owning features end to end, from design hand-off to
production monitoring. Enjoys mentoring and tightening the feedback loop between
design and engineering.

EXPERIENCE
Senior Frontend Engineer — Contoso Cloud (2022–present)
- Led the rebuild of the billing dashboard in React 18 + TypeScript, cutting
  first-contentful-paint by 40% and reducing support tickets about "stuck"
  screens by a third.
- Introduced a component testing baseline (Vitest + Testing Library) and raised
  coverage on critical checkout flows from 20% to 85%.
- Mentored two junior engineers through their first on-call rotations.

Frontend Engineer — Fabrikam Analytics (2019–2022)
- Built the reusable charting library used across four internal products.
- Shipped a WCAG 2.1 AA accessibility pass on the reporting suite, including
  keyboard navigation and screen-reader labels for all interactive charts.
- Migrated a legacy jQuery admin panel to React incrementally with zero downtime.

Junior Web Developer — Northwind Retail (2018–2019)
- Implemented responsive product pages and A/B-tested checkout variations.

SKILLS
React, TypeScript, JavaScript (ES2022), HTML5, CSS/Tailwind, Vite, Vitest,
Testing Library, Node.js, REST APIs, accessibility (WCAG), Git, CI/CD.

EDUCATION
B.Sc. Computer Science — Sample State University (2018)`

/** Clearly-synthetic sample job description, seeded into the job-description paste-text path. */
export const SAMPLE_JOB_DESCRIPTION = `SAMPLE JOB DESCRIPTION — synthetic example, not a real posting.

Frontend Engineer (React) — Contoso Cloud

About the role
Contoso Cloud is hiring a Frontend Engineer to help build the next generation of
our customer-facing billing and analytics dashboards. You will work closely with
design and product to ship accessible, fast, well-tested interfaces used by
thousands of businesses every day.

What you'll do
- Build and maintain features in React and TypeScript, from design hand-off to
  production.
- Own front-end performance and accessibility (WCAG 2.1 AA) for the surfaces you
  ship.
- Write component and integration tests and help keep the CI pipeline green.
- Collaborate with backend engineers on REST API contracts.
- Mentor teammates and participate in code review.

What we're looking for
- 3+ years of professional experience with React and modern JavaScript/TypeScript.
- Strong CSS fundamentals and a track record of accessible UI work.
- Experience with a component testing framework (Vitest, Jest, or similar).
- Familiarity with build tooling (Vite or Webpack) and Git-based workflows.
- Clear written communication and a bias toward small, reviewable changes.

Nice to have
- Experience with data visualization or dashboards.
- Exposure to CI/CD and front-end performance monitoring.

Contoso, Fabrikam, and Northwind are fictitious names used for sample content.`
