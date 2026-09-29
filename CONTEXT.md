# Career Workbench Domain Context

## Language
**Issue tracker**
The system that hosts repository work items. In this project, use GitHub Issues.

**Issue**
A single tracked unit of work (feature, bug, task, PRD slice) in the issue tracker.

**Triage role**
A canonical workflow label applied to an issue during triage (for example:
`needs-triage`, `ready-for-agent`).

## Product domain
AI-powered job-search workspace with six tools:
1. Resume Analyzer
2. Job Match
3. Career Path
4. Cover Letter
5. Interview Q&A
6. Portfolio Planner

## Current operating mode
Local-only, feature-first (Sept 2026 reset, `docs/roadmap.md`): all results are visible, there is no ad gate, and every product area is always on. Autopilot is the one experimental, development-only switch.

## Telemetry

**Frontend telemetry**
Client-observed behavioral events sent via `trackTelemetry()` to
`POST /api/v1/telemetry/events`. Consent-gated (skipped if the user declined
cookies); strict allowlist schema, never carries resume/JD/generated content. The
backend writes each event to structured stdout only; nothing is persisted and no
third-party analytics or error-monitoring vendor receives it.

**Backend run logs**
Server-written structured log lines for each tool run (start, completion,
duration, categorized failure), produced in the same request path as the tool.
They are not client-reported, so cookie consent does not gate them, and they
carry no resume, job-description or generated content.

## Fabrication check

**Fabrication candidate**
A proper-noun/employer/quantified claim present in generated output that cannot be
traced back to the source resume text or confirmed evidence. The live check
(`services/fabrication.py`) is used by the Application Reviewer. The R8 eval
harness that once scored fixtures was removed in the Sept 2026 reset (D-125).

## Monetization experimentation (R9)

**Monetization evidence gate**
The prerequisite evidence and decisions that must exist before a revenue treatment
can reach users: the R6 two-week activation baseline, an accepted activation target,
an accepted launch market/segment, and candidate-specific legal readiness.

**Monetization candidate**
One revenue hypothesis evaluated for R9: advertising, subscription, or a defined
hybrid of the two. No candidate is selected while the monetization evidence gate is
open.

**Entitlement**
A server-issued right to receive a monetized capability or restricted payload. A
browser unlock flag or provider UI state is never an entitlement.

**Control experience**
The unchanged full-access experience against which an R9 treatment is measured and
which remains available as the accessible, non-deceptive fallback.

## Source family

An allowlisted job-source category (`licensed`, `employer_ats`,
`public_career_page`, `user_provided`) used to label discovery sources and
listings and for aggregate reliability signals without retaining a full hostname,
path, or query. The R10 scaling-trigger vocabulary was removed with its scorecard
(D-125).

## Evidence Profile (R11)

**Evidence item**
One typed, user-owned career claim (experience, achievement, skill, education,
project, certification, preference, or reusable interview evidence) stored in the
Evidence Profile with provenance and confirmation state.

**Provenance**
The recorded origin of an evidence item: `imported` (parsed from an uploaded
document), `inferred` (proposed by tool or model output), or `user-entered`.

**Confirmation state**
The trust lifecycle of an evidence item: `unconfirmed` (a suggestion) until an
explicit user action marks it `confirmed`. No automated path may confirm.
Rejecting a suggestion deletes it. Only confirmed evidence may enter generation as
locked fact.

**Run-derived evidence**
The existing per-run fields (for example `ResumeEvidence`, `evidence_used`,
`resume_evidence`) computed for a single tool result. Run-derived evidence is
unverified model output, distinct from Evidence Profile items and never
authoritative.

## CV Studio (R12)

**CV document**
A persisted, per-user structured document of typed sections and entries whose
factual claims reference Evidence Profile items. The editorial layer (selection,
phrasing, ordering, layout) over the factual record — never a freeform rich-text
document.

**CV variant**
An immutable, recoverable snapshot of a CV document, typically tailored to one
target role. The base document and every prior variant remain restorable;
restoring one first keeps the replaced document as a variant.

**CV template**
One of five declarative layouts (ATS Essential, Professional Editorial,
Technical Portfolio, Modern Two-Column, Minimal Serif) from which preview, DOCX,
and PDF render deterministically from the same structured document. The backend
style catalog is the single source of template, font, palette and density values;
the live preview looks them up rather than keeping its own copy.

**ATS-aware check**
A deterministic structural validation of a CV document or its exports — section
structure, text layer, fonts, links, page breaks, re-import machine-readability.
The product never presents a universal ATS score or a ranking, interview, or
employment promise.

**Tailored change**
One proposed modification to a CV document, shown as a before/after diff carrying
requirement and evidence provenance. It enters a new CV variant only through an
explicit accept action (review is accept or reject; there is no free-text edit
of a proposed change); a claim without confirmed supporting evidence requires an
explicit user confirmation step.

## Applications and Reviewer

**Application**
A `Workspace` row once it targets a job (it has a status or a job posting); the
product surface is the Applications page (formerly Campaigns, with the Approval
Queue merged in). One container per target company and role holding the current
listing, the selected CV variant and cover letter, prepared drafts, open
questions and answers, tasks, one free-text notes field, and an activity
timeline. Statuses are `saved`, `applied`, `interviewing`, `offer`, `rejected`,
`withdrawn`; any move is allowed and "ready to apply" is derived, never stored.
Code still says `Workspace`, `campaign_*` and `/campaigns` in places.

**Canonical listing**
The persisted job posting an application targets - title, company, description,
source URL, and retrieval date - stored as owner-isolated user content.
Telemetry about listings stays source-family aggregates only.

**Campaign event**
One append-only record of activity on an application (status change, material
selection, task action) from which the activity timeline derives. Events are
never updated or deleted by product code.

**Applied snapshot**
The single immutable record written when an application is marked applied: the
exact listing and material content that was sent, with a SHA-256 digest. Later
edits to the CV or cover letter never change it. This is the only freeze point;
there is no separate approval step.

**Reviewer finding**
One advisory result from the Application Quality Reviewer pass - an unsupported
claim with its failed evidence trace, a missed listing requirement, a
cross-document contradiction, generic writing, or a document defect. Findings are
editable advice; they are never auto-applied and never create or confirm evidence.

## Lawful Job Discovery (R14)

**Source registry entry**
The governance record that permits ingestion from one discovery source: owner,
terms status and review date, allowed behavior, rate limit, attribution rule,
retention rule, and kill switch. No ingestion happens outside the registry, and no
source activates before its terms review is accepted.

**Discovered listing**
A job posting persisted in the product-owned listings store with source
attribution and retrieval date, deduplicated across sources and expired per its
source's retention rule. Distinct from a campaign's canonical listing, which is
owner-isolated user content.

**Recommendation**
A discovered listing ranked against confirmed Evidence Profile items and
preference items, always carrying an explainable match rationale. A recommendation
becomes a campaign only by explicit user adoption.

**Query contract**
The registry-declared minimal parameters a source query may carry (for example
role keywords and location). Profile text, employer history, and identity never
leave the product.

## Preparing Applications

**Prepared drafts**
The cover letter and screening-answer drafts generated for one application from
the CV text and confirmed Evidence Profile items only. "Prepare for me" does this
across adopted discovery listings that match the owner's preferences (keywords,
locations, remote), at most ten per click.

**Mandatory stop**
A field category - sensitive, legal, eligibility, relocation, demographic, salary,
work authorization, uncertain or free-form - that the system never drafts from
inference. It is classified by one server-side function and becomes an open
question only the owner's typed answer resolves. An application with unresolved
open questions is not ready to apply.

**Application details**
The owner's one-time contact details and typed standing answers (work
authorization, sponsorship, notice, salary, relocation). Standing answers count
as explicit user input for a stop; Autopilot fills forms from them and never
guesses contact details from CV text.

The submission boundary: the product prepares, the owner applies. Nothing in the
product submits an application (ADR 0009).

## Career Development Loop (R17)

**Gap classification**
The reviewer-traced diagnosis of a gap tailoring cannot truthfully close, as
exactly one of four kinds: presentation weakness, uncaptured evidence, evidence
not yet produced, or missing skill. Every classification cites the failed
requirement or evidence trace that produced it.

**Development item**
One tracked response to a classified gap — the gap reference, chosen response,
planned/in-progress/completed state, optional target date, and notes. Bounded by
design; not a generic project manager.

**Honest-response rule**
Each gap kind maps to its only truthful response: rewording for presentation,
capture proposal for uncaptured evidence, portfolio project for evidence not yet
produced, learning recommendation for missing skill. Tailoring is never offered
for substance gaps, and no response fabricates.

**Completion proposal**
The R11 item created when a development item completes. With the owner's own
notes it is confirmed; otherwise it is an `unconfirmed` suggestion reviewed on the
profile like any other.

## Branch roles

- `chapter2` is the long-lived product experimentation and hardening branch.
- `main` contains reviewed stable product changes.
- `deploy` is the stable Railway deployment branch.
- Short-lived work branches target `chapter2` until a release is promoted.
