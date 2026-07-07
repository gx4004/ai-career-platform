# Career Workbench — Product Specification

**Status:** canonical product contract
**Last reviewed:** 2026-07-07
**Posture:** thesis demo mode today; the eventual first release is a free private
beta (D-028). Monetization is deferred (D-019, D-020).

This document owns the product contract and scope: what the product promises users
and what is deliberately out of scope. Engineering boundaries and invariants live in
`docs/architecture.md`; priorities and gates live in `docs/roadmap.md`; durable
decisions live in `docs/decisions.md`. The original 2026-03 specification is
preserved in `docs/spec-legacy.md` and is historical only.

## 1. Product Intent

Career Workbench is an AI-powered job-search workspace: one resume, six connected
tools, multiple workflow paths (D-001). A user uploads or pastes a resume once and
reuses it across resume analysis, job matching, application material generation,
interview preparation, and career planning. Structured output from one tool feeds
the next, which is the product advantage over six standalone generators.

The long-term direction — Evidence Profile, premium CV Studio, Application
Campaigns, lawful job discovery, and trust-staged application automation — is owned
by `docs/product-direction.md` and gated by the roadmap (R11+). None of it is a
current implementation claim.

## 2. Access Modes

| Mode | Persistence | Contract |
|---|---|---|
| Guest | None — results are transient browser state, never stored server-side (D-009) | Any tool can run. Results expire when the session context is gone ("Result expired — run again"); saving requires signup. Guest→auth migration of prior results is deliberately not offered. |
| Authenticated | Server-side (PostgreSQL) | Full workspace: run history, favorites, workspace grouping and labels, revision chains, search, exports. |

Guest ephemerality is a deliberate conversion lever, not a gap. Guest and abuse
limits are enforced by the bounded rate limits and cost ceilings described in
`docs/architecture.md` (Abuse Controls).

## 3. The Six Tools

Canonical order and grouping (D-003; registry:
`frontend/src/lib/tools/registry.ts`):

| # | Tool | Group | Input | Core output |
|---|---|---|---|---|
| 1 | Resume Analyzer | primary | resume text, optional job description | score (0–100) + breakdown, issues with fixes, evidence, top actions |
| 2 | Job Match | primary | resume + job description | fit score + verdict, matched/missing keywords with contextual guidance, requirement mapping, recruiter summary |
| 3 | Career Path | planning | resume, optional target role | 3–5 career directions with fit scores, skill gaps, next steps |
| 4 | Cover Letter | application | resume + job description + tone | sectioned editable letter draft with per-section rationale |
| 5 | Interview Q&A | application | resume + job description + question count (3–12) | question deck with answer frameworks, focus areas, practice mode (3 attempts per question, cheaper feedback model) |
| 6 | Portfolio Planner | planning | resume + target role | project roadmap (foundational → advanced) with hiring signals |

Shared UX pattern: input page (dark-to-light gradient hero) → cinematic loader →
result page (per-tool view; dark hero variant with score ring for Resume and Job
Match). The visual contract lives in `design.md`.

Scoring semantics:

- Only Resume Analyzer and Job Match blend deterministic heuristics with model
  scoring (D-005); the generative tools use model-only quality assessment.
- On model failure after retries, Resume Analyzer and Job Match silently fall back
  to deterministic analysis; generative tools fail explicitly with a retry option
  (D-007). A fake generated artifact is worse than a clear failure.
- The LLM auto-detects the input language and responds in it; the product UI itself
  is English-only (D-014).

## 4. Workflow Continuity

- Workflow context (resume text, job description, target role, intermediate
  results) is tab-scoped in `sessionStorage`; no cross-tab sync (D-011).
- Resume analysis and job match results hand off silently into Cover Letter and
  Interview when present; their absence never blocks a tool.
- Every result page suggests static next-action tools.
- Re-generate (optionally with user feedback) always creates a new `ToolRun` linked
  by `parent_run_id`; prior results are never overwritten (D-010).

## 5. Accounts, Auth, and Data Rights

- Email/password and Google OAuth sign-in; JWTs live in HttpOnly cookies (D-008).
- No email verification; disposable email domains are blocked at registration.
- Password reset via Resend is the only transactional email in V1 — no welcome or
  deletion-confirmation emails.
- Account deletion is immediate and removes all runs, workspaces, and the user
  record (GDPR/RODO). Retention and backup policy beyond this is an open human
  decision (issue #74, D-NEXT-3).
- Explicit logout, account deletion, and the manual local-data reset all clear
  sensitive browser state (drafts, workflow context, guest results, resume carry).

## 6. History, Workspaces, and Exports

- History: paginated, searchable, filterable by tool, favorites, revision chains.
- Workspaces group runs per application; label format is suggested
  ("Company – Role") but never enforced; unassigned runs are valid.
- Exports: TXT and Markdown for everyone on all tools; PDF export for Cover Letter
  and Interview Q&A requires authentication. Exports use the user's last edited
  version, without an AI disclaimer.

## 7. Admin

Admin lives inside the main frontend under `/admin/*`, protected by the `is_admin`
flag (D-016): user management, run moderation, aggregate stats, system health. No
separate admin application exists.

## 8. Monetization Posture

The historical ad-gate UI exists in code but is bypassed: in thesis demo mode all
results are fully visible with no ad interaction (D-019). Do not re-enable the gate,
implement subscriptions, add affiliate links, or integrate a real ad SDK without an
explicit roadmap decision (R9). The historical client-side ad unlock is not a
durable entitlement system and must not be treated as one.

## 9. Out of Scope for the Current Horizon

Per `docs/roadmap.md` non-goals and accepted decisions:

- i18n translations (infrastructure may remain; English only, D-014);
- premium/subscription tier, affiliates, real AdSense SDK;
- CAPTCHA beyond the evidence-triggered posture in `docs/architecture.md`;
- LLM streaming, multi-provider fallback (single Vertex AI provider, D-006);
- native mobile apps (responsive web only, D-015);
- collaboration/sharing, A/B testing framework, CV version management;
- new tools before the existing six are validated.

## 10. Related Documents

| Question | Owner |
|---|---|
| What is the current status/blockers? | `docs/state.md` |
| What comes next and when is it done? | `docs/roadmap.md` |
| Why was this chosen? | `docs/decisions.md`, `docs/adr/` |
| How is it built and what must not break? | `docs/architecture.md` |
| Security, privacy, abuse posture | `docs/threat-model.md` |
| Visual system | `design.md` |
| Long-term product direction | `docs/product-direction.md` |
