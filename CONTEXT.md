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

## Branch roles

- `chapter2` is the long-lived product experimentation and hardening branch.
- `main` contains reviewed stable product changes.
- `deploy` is the stable Railway deployment branch.
- Short-lived work branches target `chapter2` until a release is promoted.
