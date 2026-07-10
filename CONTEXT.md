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
Thesis demo mode: all results are visible and ad gating is bypassed.

## Analytics & instrumentation

**Frontend telemetry**
Client-observed behavioral events sent via `trackTelemetry()` to
`POST /api/v1/telemetry/events`. Consent-gated (skipped if the user declined
cookies); strict allowlist schema, never carries resume/JD/generated content.

**Backend metrics**
Server-computed operational data (per-tool duration, LLM cost estimate) written
directly by the backend in the same request path that already runs the tool —
not client-reported, so cookie consent does not gate it.

**Activation event**
Any event in the R6 taxonomy spanning landing → tool start → tool completion →
connected next step → signup → revisit/export, used to measure where users find
value or abandon the workflow.

## Output quality evaluation (R8)

**Eval fixture**
A small, hand-authored synthetic resume/job-description pair used to test tool
output — never sampled or derived from real user content (see
`docs/adr/0002-r8-eval-fixture-data-source.md`).

**Calibration miss**
For Resume Analyzer/Job Match only: a fixture whose actual blended score
(`compute_blended_score`) falls outside its pre-assigned expected score band.

**Fabrication candidate**
For the four generative tools: a proper-noun/employer/quantified claim present
in generated output that cannot be traced back to the source resume text.

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

## Reliability and cost scaling (R10)

**Scaling trigger**
A predeclared, sustained operational threshold that authorizes evaluation of one R10
response. A trigger is evidence for review, not automatic permission to deploy the
candidate response.

**Reliability response**
One bounded, reversible change selected for a fired scaling trigger. Independent
responses are not bundled into a general scaling platform.

**Provider incident**
A time-bounded period in which the generation provider causes user-visible tool
failures or latency-budget breaches, grouped without raw provider exceptions or user
content.

**Source family**
An allowlisted job-import category such as a supported ATS family or `other`, used for
aggregate reliability evidence without retaining a full hostname, path, or query.

## Evidence Profile (R11)

**Evidence item**
One typed, user-owned career claim (experience, achievement, skill, education,
project, certification, preference, or reusable interview evidence) stored in the
Evidence Profile with provenance and confirmation state.

**Provenance**
The recorded origin of an evidence item: `imported` (parsed from an uploaded
document), `inferred` (proposed by tool or model output), or `user-entered`.

**Confirmation state**
The trust lifecycle of an evidence item: `unconfirmed` until an explicit user
action marks it `confirmed` or `rejected`. No automated path may confirm. Only
confirmed evidence may enter generation as locked fact; rejected evidence is
excluded from all downstream use.

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
target role. The base document and every prior variant remain restorable.

**CV template**
One of exactly three declarative initial layouts (ATS Essential, Professional
Editorial, Technical/Portfolio) from which preview, DOCX, and PDF render
deterministically from the same structured document.

**ATS-aware check**
A deterministic structural validation of a CV document or its exports — section
structure, text layer, fonts, links, page breaks, re-import machine-readability.
The product never presents a universal ATS score or a ranking, interview, or
employment promise.

**Tailored change**
One proposed modification to a CV document, shown as a before/after diff carrying
requirement and evidence provenance. It enters the document only through an
explicit accept or edit action; a claim without confirmed supporting evidence
requires an explicit user confirmation step.

## Application Campaigns and Reviewer (R13)

**Application campaign**
A `Workspace` evolved in place: one container per target company and role holding
the canonical listing, selected materials, bounded tracking (status, tasks, notes,
minimal contacts), and an activity timeline. Every pre-R13 workspace remains a
valid label-only campaign.

**Canonical listing**
The persisted job posting a campaign targets — title, company, description, source
URL, and retrieval date — stored as owner-isolated user content. Telemetry about
listings stays source-family aggregates only.

**Campaign event**
One append-only record of campaign activity (status change, material selection,
note, task action) from which the activity timeline derives. Events are never
updated or deleted by product code.

**Submitted-application snapshot**
An immutable bundle referencing the exact material versions at applied time,
unaffected by later edits.

**Reviewer finding**
One advisory result from the Application Quality Reviewer pass — an unsupported
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

## Application Approval Queue (R15)

**Application packet**
A prepared application composition referencing existing entities — campaign,
listing, selected CV variant, optional cover letter, screening-answer drafts,
match rationale, and an explicit unresolved-questions list. Packets never copy
material content freestanding.

**Queue rule**
A user-defined filter (role, location, compensation, work authorization, quality
threshold) plus volume caps and cost ceilings that a listing must pass before any
packet is prepared. No rules, no queue.

**Mandatory stop**
A field category — sensitive, legal, eligibility, relocation, demographic, salary,
work authorization, uncertain or free-form — that the system never drafts from
inference. Only explicit user input resolves a stop, and an unresolved question
blocks packet approval.

**Packet approval**
The explicit user action that freezes an immutable packet snapshot and hands the
user to the official destination to submit themselves. No R15 code path performs,
schedules, or retries a submission; submission automation exists only behind R16's
per-source authorization contract.

## Branch roles

- `chapter2` is the long-lived product experimentation and hardening branch.
- `main` contains reviewed stable product changes.
- `deploy` is the stable Railway deployment branch.
- Short-lived work branches target `chapter2` until a release is promoted.
