# Career Workbench — Product Specification

**Status:** canonical baseline
**Last reviewed:** 2026-07-05
**Product stage:** pre-launch / thesis-demo transition

## Product Promise

Career Workbench turns a job seeker's existing resume and a target role into a
connected, explainable body of work: diagnosis, role fit, application materials,
interview preparation, career direction, and proof-building projects.

The product should feel like one workspace with a continuous context, not six
unrelated AI generators.

## Primary User

An early-career or transitioning professional who:

- has a resume but is unsure what is weakening it;
- is evaluating or applying to a concrete role;
- wants useful next actions rather than generic encouragement;
- needs professional output without learning prompt engineering;
- may try the product before creating an account.

## Jobs to Be Done

1. Show me what recruiters are likely to notice first in my resume.
2. Explain how well my evidence matches a real role and what is missing.
3. Help me create application material grounded in my actual experience.
4. Prepare me for likely interview questions without fabricating achievements.
5. Help me choose a realistic next direction and close its skill gaps.
6. Turn missing evidence into portfolio projects I can actually build.

## Core Workflow

```text
Resume Analyzer ──> Job Match ──> Cover Letter
       │                 └──────> Interview Q&A
       └────────> Career Path ──> Portfolio Planner
```

The preferred tool order is:

1. Resume Analyzer
2. Job Match
3. Career Path
4. Cover Letter
5. Interview Q&A
6. Portfolio Planner

Users may enter at any tool. When context exists, downstream tools should reuse it
without requiring repetitive paste/upload work.

## Tool Contracts

### Resume Analyzer

Inputs: resume file or text.

Outputs: explainable score, category breakdown, issues with evidence, strengths, and
prioritized fixes.

Rule: scoring blends deterministic quality signals with model analysis.

### Job Match

Inputs: resume plus job description or supported job import.

Outputs: explainable match score, requirement states, missing keywords/evidence,
tailoring actions, and recruiter-facing summary.

Rule: scoring blends deterministic matching with model analysis.

### Career Path

Inputs: resume and optional goals/preferences.

Outputs: realistic directions, comparisons, skill gaps, timelines, and next steps.

Rule: recommendations must distinguish evidence from inference.

### Cover Letter

Inputs: resume, target job, and optional tone/context.

Outputs: a tailored draft plus customization guidance.

Rule: do not invent experience, metrics, employers, or credentials.

### Interview Q&A

Inputs: resume, target job, and question preferences.

Outputs: role-specific questions, answer structures, focus areas, and practice
feedback.

Rule: practice is bounded for cost and abuse control; feedback uses the configured
practice model.

### Portfolio Planner

Inputs: resume, direction/role, and optional constraints.

Outputs: evidence gaps, project concepts, recommended first project, and an ordered
build plan.

Rule: projects should create credible proof for the target direction.

## Access and Persistence

### Guest

- Can browse and run all six demo tools.
- Receives a transient result identified by a client-side demo ID.
- Result may survive refresh in the same tab through `sessionStorage`.
- Result is not written to the authenticated history database.
- Is prompted to sign in for durable history and workspace continuity.

### Authenticated

- Can save runs to history.
- Can group linked runs into workspaces.
- Can favorite, label, revisit, regenerate, and delete owned runs.
- Regeneration creates a new run and preserves the revision chain.
- Can manage account data subject to the privacy policy.

### Admin

- Can access aggregate operational views and authorized user/run administration.
- Must never expose secrets or unnecessary resume/application content.

## Cross-Cutting Product Requirements

### Trust

- Clearly distinguish heuristic/model output from objective fact.
- Ground advice in user-provided evidence.
- Never fabricate user history.
- Display readable error and recovery states instead of blank pages.

### Privacy and Security

- Follow GDPR/RODO principles: minimization, purpose limitation, deletion, and
  transparent processors.
- Keep auth tokens in secure HttpOnly cookies.
- Do not place secrets or tokens in local/session storage.
- Scrub sensitive request content from monitoring.
- Treat resumes and job-search material as sensitive personal data.

### Accessibility

- Core flows work with keyboard navigation.
- Interactive targets are at least 44×44 CSS pixels where practical.
- Forms have programmatic labels and visible focus.
- Text and controls meet WCAG AA contrast.
- Reduced-motion preferences are honored.

### Reliability

- Resume and Job Match may use a documented heuristic fallback when the LLM fails.
- Generative tools show an explicit retryable failure rather than fabricated output.
- Duplicate deterministic requests may use a user-scoped cache.
- API and frontend schemas stay synchronized.

### Performance

- Preserve route-level code splitting.
- Avoid loading admin or result-heavy code on the public landing path.
- Define a measured production budget before launch; the old 200 KB target is not
  considered active until a new baseline is recorded.

## V1 Scope

Included:

- six connected tools;
- guest demo and email/Google authentication;
- authenticated history, workspaces, and revision chains;
- resume parsing and job-description import with paste fallback;
- TXT/Markdown export and existing supported document export;
- operational telemetry, rate limiting, and admin views;
- responsive web experience;
- English product experience.

Not in V1:

- native mobile apps;
- collaboration or public sharing;
- automated job discovery/application;
- real-time LLM streaming;
- multilingual product content;
- subscriptions, affiliate revenue, or production ad gating until explicitly promoted;
- resume version library beyond run history/revision chains.

## Product Success Signals

Instrumentation must eventually answer:

- What share of visitors start and complete a first tool run?
- What share continue to a second connected tool?
- What share of guests create an account after receiving value?
- Which tool and failure category cause abandonment?
- Do users revisit or export saved results?
- What is model cost and latency per completed workflow?

Numeric targets remain `proposed` until a real analytics baseline and launch target
are agreed.

## Open Product Questions

These require user decisions before their roadmap outcomes become `ready`:

1. Is the next release a public MVP, a private beta, or a portfolio/thesis showcase?
2. Which country/market and user segment is the first launch optimized for?
3. Is monetization part of the first public release or a later validation phase?
4. What retention/deletion policy applies to resume text and generated results?
5. Which export formats are launch-critical?
