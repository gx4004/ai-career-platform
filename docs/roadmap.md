# Career Workbench — Product Roadmap

**Planning horizon:** release candidate through premium application automation
**Last reviewed:** 2026-07-05
**Roadmap rule:** outcomes live here; implementation tasks live in issues/PRs.

## North Star

Help a job seeker turn verified experience into exceptional, role-specific
applications, discover suitable opportunities, and progress with advice and
automation grounded in their evidence.

## Now — Establish and Remediate the Engineering Baseline

### R0. Engineering Baseline

**Status:** complete
**Outcome:** the current product has a reproducible, evidence-backed engineering
baseline on the product experimentation branch.

Acceptance gate:

- `chapter2` exists remotely while `main` and `deploy` remain stable;
- repository skill, issue-tracker, and branch guidance is internally consistent;
- frontend install, typecheck, tests, and production build have recorded outcomes;
- backend tests and clean-database migration have recorded outcomes;
- environment examples are checked for completeness without exposing secrets;
- three representative guest submissions have recorded outcomes;
- every failure is fixed within the R0 policy or linked to a focused issue.

### R1. Baseline Remediation and Code Quality

**Status:** complete
**Outcome:** failures and high-confidence code-quality defects discovered by R0 are
resolved without changing accepted product contracts.

Acceptance gate:

- frontend typecheck, tests, and production build pass;
- backend tests pass;
- clean database migrates to head;
- environment examples cover required settings without secrets;
- setup instructions reproduce the verified baseline from a clean checkout;
- accepted R0 defect issues are closed or explicitly deferred;
- broken/stale setup instructions are corrected.

### R2. End-to-End Product Audit

**Status:** complete
**Outcome:** every V1 journey is verified against the canonical spec.

R2 uses deterministic provider responses at the browser-test boundary. Live Vertex
authorization remains separately owned by issue #51 and is not an R2 completion
gate; no production mock provider or fallback is permitted.

Acceptance gate:

- all six tools complete in guest mode;
- authenticated runs persist and remain owner-isolated;
- three connected workflows carry the expected context;
- history, workspace, favorite, label, regenerate, delete, and exports work;
- errors, retries, expired guest results, and empty states are understandable;
- no P0/P1 defects remain; accepted P2 deferrals are visible.

## Next — Make It Safe to Release

### R3. Privacy, Security, and Abuse Gate

**Status:** specification re-grill in progress
**Outcome:** sensitive career data has a documented lifecycle and defensible controls.

Acceptance gate:

- retention, deletion, and account-erasure behavior are accepted and tested;
- cookies, OAuth, password reset, CORS, CSRF posture, and authorization are reviewed;
- browser storage inventory is minimized and documented;
- Sentry/telemetry scrubbing is verified with representative failures;
- scraper SSRF protections and upload validation are tested;
- rate limits and cost ceilings cover guest and authenticated abuse;
- privacy, terms, cookies, and processor disclosures match reality.

### R4. Accessibility, Mobile, and Performance Gate

**Status:** complete
**Outcome:** core workflows are usable on common mobile sizes, by keyboard, and on a
reasonable connection.

Acceptance gate:

- 320 px and 375 px walkthroughs have no blocking overflow or hidden actions;
- key flows are keyboard-completable with visible focus;
- automated scans show no critical accessibility violations on representative routes;
- reduced motion and semantic labels are verified;
- current performance baseline is measured;
- budgets for initial JS/CSS, LCP, CLS, and API latency are accepted and met or have
  explicit deferrals.

### R5. Staging and Release Operations

**Status:** blocked by remaining R3 production decisions and evidence
**Outcome:** deployment, migration, monitoring, and rollback are rehearsed before users
depend on the product.

Acceptance gate:

- staging mirrors intended production topology;
- required environment variables and provider credentials are validated;
- migration and rollback/forward-fix procedure is rehearsed with a backup;
- health checks, Sentry, telemetry, OAuth, email, and LLM calls work on staging;
- deployment branch and promotion ownership are explicit;
- post-deploy smoke checklist and incident contacts exist.

## Then — Validate the Product

### R6. Activation Instrumentation

**Status:** PRD published (#103; tracer issues #104–#108)
**Outcome:** the team can see where users receive value or abandon the workflow without
collecting raw sensitive content.

Acceptance gate:

- event taxonomy covers landing → tool start → tool completion → connected next step
  → signup → revisit/export;
- events avoid resumes, job descriptions, generated text, email, and stable sensitive
  identifiers where unnecessary;
- funnel and failure dashboards exist;
- per-tool latency and model cost are observable;
- a two-week baseline can be compared by access mode and tool.

### R7. First-Run and Continuity Improvements

**Status:** PROVISIONAL PRD published (#109; tracer issues #110–#115), still evidence-driven — no candidate ships live until R6's baseline exists
**Outcome:** more users finish a first useful result and continue to the next relevant
tool.

Candidate experiments, promoted only after baseline data:

- clearer entry choice between resume-first and role-first;
- better sample/demo inputs;
- context-carry transparency and controls;
- stronger next-best-action after each result;
- lower-friction signup after value;
- result revisit and export reminders.

Exit gate: at least one accepted activation metric improves without a material
increase in failure, cost, or privacy risk.

### R8. Output Quality Program

**Status:** PRD published (#118; tracer issues #119–#124)
**Outcome:** changes to prompts, heuristics, and models can be evaluated consistently.

Acceptance gate:

- representative, privacy-safe evaluation sets exist for all six tools;
- scoring tools track calibration and explanation consistency;
- generative tools track groundedness, usefulness, and fabrication failures;
- prompt/model changes run regression evaluation before release;
- quality, latency, and cost tradeoffs are reported together.

## Later — Business and Scale

### R9. Monetization Experiment

**Status:** PROVISIONAL spec published (#126; tracer issues #127–#133), still
deferred pending the R6 two-week baseline, accepted activation target, and
launch-market/legal readiness
**Outcome:** test a revenue model without damaging trust or the core workflow.

Sequence:

1. choose ads, subscription, or hybrid from actual usage data;
2. validate legal/CMP and payment obligations for the launch market;
3. define entitlement and server-side enforcement;
4. run a bounded experiment with conversion and retention guardrails;
5. keep an accessible non-deceptive fallback.

Do not treat the historical client-side ad unlock as a durable subscription
entitlement system.

### R10. Reliability and Cost Scaling

**Status:** PROVISIONAL spec published (#135; tracer issues #136–#142), still
deferred until the R10 scorecard records a sustained trigger for an independent
response
**Outcome:** maintain service quality as concurrency and spend grow.

Candidate triggers and responses:

- multiple API instances → distributed cache/coordination review;
- repeated provider incidents → evaluated fallback-provider strategy;
- slow perceived generation → streaming or staged progress;
- abuse/cost spikes → CAPTCHA/Turnstile and stronger quotas;
- database growth → retention jobs, indexes, and capacity planning;
- job import failure concentration → domain-specific adapters or scope reduction.

## Expand — Premium Career Workbench

The strategic contract and automation boundaries live in
`docs/product-direction.md`. These outcomes remain deferred until the release-quality
foundation is verified.

### R11. Evidence Profile

**Status:** PROVISIONAL spec published (#143; tracer issues #144–#150), still
deferred until the R1–R4 gate closes — no schema, endpoint, or UI ships before
the gate (D-060–D-067, ADR 0005)
**Outcome:** users have one inspectable, correctable source of verified career
evidence that all tools can reuse.

Acceptance gate:

- profile schema covers experience, achievements, skills, education, projects,
  certifications, preferences, and reusable interview evidence;
- imported and inferred fields expose provenance and confirmation state;
- users can correct, reject, and delete profile evidence;
- downstream generation cannot silently promote unverified claims;
- retention, export, deletion, migration, and old-run compatibility are accepted;
- frontend and backend contracts and tests remain synchronized.

### R12. Premium CV Studio

**Status:** PROVISIONAL spec published (#152; tracer issues #153–#159), still
deferred until R11 ships behind the closed R1–R4 gate — no schema, endpoint,
editor, or export ships earlier (D-068–D-075, ADR 0006)
**Outcome:** a user can import, create, edit, score, tailor, version, preview, and
export a professional ATS-aware CV in the browser.

Acceptance gate:

- PDF, DOCX, and text imports become correctable structured CV data;
- structured editing covers required CV sections without a freeform document-editor
  dependency;
- general quality and job-specific scoring are explainable;
- tailoring shows reviewable before/after diffs and evidence provenance;
- the original and prior variants remain recoverable;
- at least three production-quality templates pass mobile editing and print QA;
- DOCX and PDF exports pass visual, text-layer, link, page-break, and re-import tests;
- no unsupported claim can be accepted without an explicit user confirmation path;
- accessibility, privacy, cost, latency, and failure behavior meet accepted budgets.

### R13. Application Campaigns and Reviewer

**Status:** PROVISIONAL spec published (#161; tracer issues #162–#168), still
deferred until R12 ships — no migration, endpoint, reminder channel, or reviewer
ships earlier (D-076–D-083, ADR 0007)
**Outcome:** each target role has a coherent campaign containing its listing,
materials, preparation, tracking, and quality review.

Acceptance gate:

- workspace migration and backward compatibility are defined;
- campaign stores company, role, listing source, status, deadlines, tasks, notes,
  contacts, and a complete material timeline;
- the selected CV, cover letter, interview preparation, and submitted snapshot remain
  linked;
- a separate reviewer identifies unsupported claims, missed requirements,
  contradictions, generic writing, and document defects;
- reminders are consented, rate-limited, and revocable;
- campaign data is owner-isolated, exportable, and deletable.

### R14. Lawful Job Discovery

**Status:** PROVISIONAL spec published (#170; tracer issues #171–#177), still
deferred until R13 ships, with every individual source additionally gated behind
an accepted terms review (D-084–D-091, ADR 0008)
**Outcome:** users receive deduplicated, explainable job recommendations from sources
that explicitly permit the implemented behavior.

Acceptance gate:

- every source has documented terms status, attribution, rate, retention, and owner;
- licensed APIs, feeds, and supported ATS integrations are preferred;
- allowlisted public sources honor applicable technical and contractual controls;
- expired and duplicate listings are handled;
- source-specific kill switches and monitoring exist;
- no LinkedIn or other platform dependency relies on unauthorized scraping;
- users can hide sources, correct preferences, and explain recommendation errors.

### R15. Application Approval Queue

**Status:** PROVISIONAL spec published (#179; tracer issues #180–#186), still
deferred until R14 ships and packet-grade quality evidence is accepted — no
packet preparation ships earlier, and R15 contains no submission code path
(D-092–D-099, ADR 0009)
**Outcome:** the system prepares high-quality application packets for explicit user
review and approval.

Acceptance gate:

- user-defined role, location, compensation, work authorization, and quality rules
  filter candidates;
- every packet contains match rationale, tailored CV, optional cover letter,
  screening-answer drafts, and unresolved questions;
- sensitive, legal, eligibility, relocation, demographic, salary, and uncertain
  answers always stop for user input;
- accept, edit, skip, reject, and pause controls are clear;
- duplicate prevention, rate limits, audit history, and cost ceilings are verified;
- packet-quality and fabrication regression evaluations pass.

### R16. Source-Specific Trusted Autopilot

**Status:** deferred until R15 demonstrates quality and demand
**Outcome:** explicitly authorized applications can be submitted through supported
integrations without sacrificing truth, user control, or platform compliance.

Acceptance gate:

- each submission source has legal/terms approval and a maintained compatibility
  contract;
- authorization is granular, revocable, and never depends on copied credentials or
  session cookies;
- unsupported claims and uncertain fields block submission;
- CAPTCHA and access controls are never bypassed;
- submissions are idempotent and retain an exact user-visible packet snapshot;
- volume limits, anomaly detection, pause, kill, and incident controls are rehearsed;
- the user receives confirmation and can inspect every submitted field;
- launch metrics favor application quality and user outcomes over raw volume.

### R17. Career Development Loop

**Status:** deferred until campaign evidence supports it
**Outcome:** repeated application gaps become actionable learning and portfolio work
that produces newly verified evidence.

Acceptance gate:

- the system distinguishes presentation weakness, uncaptured evidence, missing
  evidence, and missing skill;
- learning and project recommendations are source-attributed where appropriate;
- progress tracking remains focused and does not become a generic project manager;
- completed work requires user confirmation before entering the Evidence Profile;
- future CV and application recommendations can reuse the new evidence.

### R18. Further Expansion

**Status:** deferred until retention is demonstrated

Possible directions:

- multilingual experience;
- shareable review links or coaching collaboration;
- storage, calendar, and supported professional-network integrations;
- salary intelligence;
- institutional career-program workflows;
- native/mobile-specific experiences.

Each expansion requires a new product decision and evidence that it strengthens the
connected-workbench promise.

## Global Release Gates

No outcome is `done` based only on implementation. It must have:

- verified acceptance criteria;
- relevant automated tests;
- explicit privacy/security review proportional to risk;
- accessible error/loading/empty states;
- deployment and rollback consideration;
- updated canonical memory where the contract changed.

## Explicit Non-Goals for the Current Horizon

- building new tools before validating the existing six;
- adding infrastructure solely because it is fashionable;
- redoing the visual system without a measured user or quality problem;
- pursuing subscriptions, ads, affiliates, i18n, streaming, or native apps as
  substitutes for release readiness and activation evidence.
