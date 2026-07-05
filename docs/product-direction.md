# Career Workbench — Product Direction

**Status:** accepted strategic direction; implementation sequenced by `roadmap.md`
**Last reviewed:** 2026-07-05
**Horizon:** product excellence through CV Studio, application campaigns, job
discovery, and approval-controlled application automation

## Product Ambition

Career Workbench should become a premium, evidence-grounded job-search operating
system. It should help a candidate turn verified experience into exceptional
application materials, find relevant opportunities, prepare high-quality application
packets, and manage each application without fabricating claims or encouraging
low-quality mass submission.

The product has three connected layers:

```text
Candidate intelligence
  verified experience, achievements, skills, projects, preferences, STAR stories

Application campaigns
  target job, fit, tailored CV, cover letter, interview prep, status, tasks, follow-up

Career development
  recurring skill gaps, learning plan, portfolio projects, newly verified evidence
```

The existing six tools remain the analytical and generative foundation. Expansion
should make them feel like one product rather than adding disconnected generators.

## Strategic Sequence

The order is deliberate:

1. Perfect and freshly verify the existing product.
2. Establish a canonical Evidence Profile.
3. Build the premium CV Studio.
4. Turn workspaces into Application Campaigns.
5. Add lawful, source-aware job discovery.
6. Add an Application Approval Queue.
7. Add submission automation only for explicitly supported sources and actions.
8. Close the loop from skill gaps to learning, portfolio work, and new evidence.

Later stages must not become an excuse to skip release quality, privacy, AI
evaluation, accessibility, or document fidelity.

## Product Pillar 1 — Existing Product Excellence

Before major expansion, every existing surface should be reliable and premium:

- all six guest and authenticated workflows;
- cross-tool context reuse and correction;
- history, workspaces, revisions, deletion, and exports;
- loading, timeout, retry, empty, expired, and partial-result states;
- mobile, keyboard, reduced-motion, and WCAG AA behavior;
- consistent visual hierarchy across public, product, account, and admin surfaces;
- regression evaluation for deterministic scoring and generated output;
- production deployment, monitoring, privacy, and rollback readiness.

“Premium” means coherent typography, spacing, interaction feedback, content hierarchy,
editing, error recovery, mobile behavior, accessibility, and perceived performance.
It does not mean decorative motion or a framework rewrite.

## Product Pillar 2 — Evidence Profile

The Evidence Profile is the user-confirmed source of truth used by every downstream
tool. It may contain:

- contact and professional summary information;
- employment, responsibilities, and quantified achievements;
- education, certifications, skills, projects, and portfolio links;
- reusable STAR stories and interview evidence;
- career goals, location, work-mode, salary, and role preferences;
- writing style and tone preferences;
- provenance and confirmation state for important claims.

AI may reframe verified evidence. It must not invent employers, dates, skills,
metrics, responsibilities, credentials, or achievements. Missing evidence should be
reported as a gap rather than silently added.

## Product Pillar 3 — CV Studio

CV Studio is the flagship expansion.

### Core journey

```text
Import PDF, DOCX, or text
  -> parse into structured CV data
  -> review and correct extraction
  -> score quality and ATS compatibility
  -> edit in the browser
  -> optionally attach a target job
  -> generate a reviewable tailored variant
  -> preview document and page breaks
  -> export DOCX or PDF
```

### Required capabilities

- structured section editing rather than an unrestricted word processor;
- base CV plus immutable or recoverable role-specific variants;
- drag/reorder, add, hide, rename, and edit sections;
- general quality and job-specific match analysis;
- before/after diffs for AI suggestions;
- requirement and evidence provenance for each material change;
- accept, reject, or edit controls;
- professional, restrained, ATS-aware templates;
- deterministic DOCX and PDF output;
- page-break, overflow, font, link, and text-layer validation;
- re-import verification to ensure exported documents remain machine-readable;
- version history connected to application campaigns.

### Honest product claim

The product may promise ATS-aware structure, validated parsing, evidence-grounded
tailoring, and high-quality document output. It must not promise a universal ATS
score, guaranteed ranking, interview, or employment outcome.

Initial templates should favor depth over quantity:

1. ATS Essential;
2. Professional Editorial;
3. Technical / Portfolio.

## Product Pillar 4 — Application Campaigns

An existing workspace should evolve into an application campaign centered on one
company and role. A campaign may contain:

- canonical job listing, source, and retrieval date;
- fit analysis and requirement map;
- selected tailored CV and cover letter;
- interview questions, practice, and verified stories;
- application status, deadlines, applied date, and follow-up reminders;
- notes, contacts, tasks, and an activity timeline;
- revision history and submitted-application snapshot.

This should remain a job-search workflow, not expand into a generic CRM or project
manager.

## Product Pillar 5 — Application Quality Reviewer

Important application materials should support a separate reviewer pass that checks:

- unsupported or fabricated claims;
- missed requirements and weak evidence;
- generic language and keyword stuffing;
- contradictions across the CV, cover letter, and screening answers;
- repetition, weak bullets, and unclear outcomes;
- document overflow, broken pagination, and parsing problems.

The user should see what changed and why. Reviewer output is advisory and must remain
editable.

## Product Pillar 6 — Job Discovery

Job discovery should rank opportunities against the Evidence Profile, explain the
match, deduplicate listings, and preserve source attribution.

Preferred source order:

1. licensed APIs, feeds, and partnerships;
2. employer or ATS integrations that explicitly permit the use;
3. allowlisted public career pages after terms and robots review;
4. user-provided URLs or pasted descriptions.

Each source requires an owner, terms review date, allowed behavior, rate limit,
attribution rule, retention rule, and kill switch.

The product must not depend on unauthorized LinkedIn or job-board scraping,
credential sharing, CAPTCHA bypass, or circumvention of technical access controls.

## Product Pillar 7 — Application Autopilot

Automation is a north-star feature, delivered through progressive trust levels.

### Level A — Application Copilot

The user selects a job. Career Workbench prepares the fit analysis, tailored CV,
cover letter, screening-answer drafts, and checklist. The user submits on the
official destination.

### Level B — Approval Queue

Career Workbench discovers suitable jobs and prepares complete application packets.
The user reviews, edits, approves, skips, or rejects each packet. Uncertain,
sensitive, legal, eligibility, salary, relocation, work-authorization, demographic,
and free-form questions require explicit user input.

### Level C — Trusted Autopilot

Submission is allowed only for supported integrations and explicitly authorized
actions. It requires:

- source-specific legal and terms approval;
- user-defined job and quality rules;
- a verified Evidence Profile;
- no unsupported claims;
- per-field provenance;
- idempotency and duplicate prevention;
- complete audit logs;
- revocable authorization;
- rate and volume limits;
- immediate pause and kill controls;
- post-submission confirmation and retained packet snapshot.

### Prohibited automation

- unattended mass submission across arbitrary sites;
- unauthorized LinkedIn or job-board automation;
- CAPTCHA or access-control circumvention;
- storing third-party passwords or copying session cookies;
- submitting uncertain answers without user approval;
- misrepresentation, fabricated evidence, or discriminatory targeting;
- engagement automation unrelated to a genuine application.

The quality promise is “the autopilot that refuses to lie,” not maximum application
volume.

## Product Pillar 8 — Career Development Loop

When tailoring cannot truthfully solve a gap, Career Workbench should distinguish:

- wording or presentation weakness;
- evidence that exists but is not captured;
- evidence the candidate has not yet produced;
- a genuinely missing skill or qualification.

The product can then create a learning plan, recommend a portfolio project, track
completion, capture new verified evidence, and improve future application materials.

## Monetization Direction

Monetization remains a post-activation experiment, but likely value boundaries are:

- free: profile import, limited analysis, and limited exports;
- paid CV Studio: premium templates, variants, DOCX/PDF export, tailoring, and review;
- paid application workspace: campaigns, tracking, reminders, and richer history;
- higher tier: discovery, Approval Queue, and supported Autopilot usage.

Pricing and entitlements require actual usage and willingness-to-pay evidence before
acceptance. Historical ad gating is not the target business model.

## Explicit Distractions

Do not prioritize these before the strategic sequence earns them:

- native mobile applications;
- social feeds or public candidate profiles;
- coaching or recruiting marketplaces;
- generic CRM and time tracking;
- dozens of mediocre CV templates;
- unrestricted multi-provider settings for ordinary SaaS users;
- mass scraping or mass auto-apply;
- automated networking messages;
- visual redesign without browser evidence;
- infrastructure for traffic that does not exist.

## Success Measures

Exact targets remain proposed until a baseline exists. Instrumentation should support:

- CV import and correction completion;
- first successful ATS-aware export;
- tailored-variant acceptance and edit rates;
- unsupported-claim detection and user corrections;
- campaign creation and application completion;
- discovery-to-approval and approval-to-submission conversion;
- duplicate, failure, withdrawal, and user-pause rates;
- interviews obtained per reviewed application cohort;
- latency and model cost per completed application packet;
- revisit and subscription retention during an active job search.

## Governance

- `product-direction.md` owns long-horizon intent and product boundaries.
- `roadmap.md` owns ordered outcomes and acceptance gates.
- `spec.md` changes when a feature becomes an accepted product contract.
- `architecture.md` changes when implementation boundaries or invariants change.
- `decisions.md` records accepted or superseded durable choices.
- implementation tasks live in issues, PRs, or a short milestone execution plan.

