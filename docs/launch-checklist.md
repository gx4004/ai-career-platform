# Career Workbench - Staging and Launch Runbook

**Status:** R5 rehearsal is unblocked by D-116. The rehearsal collects the R3
deployment evidence; promotion remains blocked until every stop condition and
remaining owner decision is closed.

This runbook is the release-operations checklist for a private beta candidate.
It records what to verify, what evidence to capture, and when to stop. Do not use
it to infer production facts that have not been checked in the deployed
environment.

## Stop Conditions

Do not promote or invite users when any of these are true:

- The accepted retention and backup controls in D-031 through D-035 are not
  satisfied, including the R5 managed-backup and restore rehearsal required by
  D-032. (`docs/threat-model.md` records D-UNK-6 and D-UNK-7 as resolved.)
- Production/staging frontend and backend domains, TLS, credentialed CORS,
  OAuth redirect values, or HSTS compatibility are unverified.
- `RATE_LIMIT_STORAGE_URI` is missing outside development or shared limiter
  storage has not been smoke-tested.
- The current database revision, backup posture, or restore path is unknown.
- Sentry, telemetry, and legal disclosures have not been reconciled with actual
  deployment settings.

## R3 Evidence Checklist (closes the R3 gate; D-116)

Record each answer in `docs/threat-model.md` §14 and the affected R3 issue
(#75, #76, #81, #82). The R3 gate closes when every row has evidence, the accepted
D-119 historical PostHog deletion is completed without export, and D-NEXT-2 names
the launch market.

- [ ] D-UNK-1: production `TRUST_PROXY_HEADERS` / `TRUSTED_PROXY_CIDRS` values match Railway's actual proxy chain (verify with a logged forwarded-header sample).
- [ ] D-UNK-2: Railway PostgreSQL connection ceiling recorded; `pool_size=20, max_overflow=10` confirmed or adjusted.
- [ ] D-UNK-3: production replica count recorded; single-replica assumptions (in-process cache, limiter) re-checked if >1.
- [ ] D-UNK-8: Google Cloud credential permission scope enumerated and minimized.
- [ ] D-UNK-9: full production environment variable inventory diffed against both `.env.example` files.
- [ ] D-UNK-10: deployed frontend/backend domains, registrable-site relationship, and end-to-end TLS recorded (unblocks #75 cookie/CORS/OAuth closure and #81 HSTS decision).
- [ ] #75: staging OAuth state round trip performed and recorded.
- [ ] #76: `RATE_LIMIT_STORAGE_URI` configured and capacity-tested on staging.
- [ ] #81: security headers verified on staging (CSP against real origins, fonts, downloads, OAuth); Docker builds verified.
- [ ] D-117: confirm `SENTRY_DSN` is unset in production (or staging scrub verification exists before it is ever set).
- [x] D-118: remnant PostHog proxy/configuration removed; disclosures reference PostHog only historically.

## Preflight Inventory

Record these before touching a shared environment:

- Branches and commits:
  - `chapter2` source commit:
  - `deploy` promotion commit, if used:
  - frontend image/build identifier:
  - backend image/build identifier:
- Railway topology:
  - frontend service URL:
  - backend service URL:
  - public app URL:
  - PostgreSQL service name:
  - replica count per service:
- Database:
  - current Alembic revision:
  - target Alembic revision:
  - backup identifier and creation time:
  - restore command or dashboard path:
- Ownership:
  - deploy owner:
  - database/backup owner:
  - incident contact:
  - legal/privacy decision owner:

## Environment Checks

Backend settings to verify in the deployed environment:

- `ENVIRONMENT=production` or the accepted staging equivalent.
- `SECRET_KEY` is unique and not an example value.
- `DATABASE_URL` points at the intended PostgreSQL instance.
- `CORS_ORIGINS` and `FRONTEND_URL` match the deployed frontend origin.
- `GOOGLE_REDIRECT_URI` matches the deployed OAuth callback.
- `RATE_LIMIT_STORAGE_URI` is configured for any non-development deployment.
- `ABUSE_IDENTITY_HMAC_KEY` is set, secret, and distinct from `SECRET_KEY`.
- `TRUST_PROXY_HEADERS` and `TRUSTED_PROXY_CIDRS` match Railway evidence.
- `SENTRY_DSN` is either intentionally unset or documented as active.
- Email provider settings are present if password reset must work.
- Vertex/Gemini credentials are present with the accepted permission scope.
- `API_REPLICA_CLASS`, `LATENCY_P95_BUDGET_MS`, `COST_ALERT_USD_24H`, and
  `DB_CAPACITY_BYTES` match the recorded deployment topology and capacity.

Frontend settings to verify:

- `VITE_API_URL` points at the deployed API route.
- `SECURITY_HSTS_ENABLED` remains off until TLS/domain evidence is accepted.
- Sentry settings match the legal disclosure decision; no PostHog variables are present.
- No ad, payment, subscription, or affiliate integration is enabled without a
  new roadmap decision.

## Migration Rehearsal

Before deploy:

1. Capture a fresh PostgreSQL backup or Railway snapshot.
2. Record the current Alembic revision from the database.
3. Run `alembic upgrade head` against the staging database.
4. Confirm `GET /api/v1/health` returns `status: ok`.
5. Verify existing authenticated users, workspaces, and saved runs still load.
6. Record whether rollback is a code revert, forward fix, migration downgrade,
   database restore, or a combination.

Do not rehearse destructive rollback against production user data. Use staging or
a restored copy.

## Staging Smoke

Run these in a clean browser profile against the staging URL.

### Public And Guest

- Landing page loads over HTTPS with no mixed-content warnings.
- Cookie banner displays and consent persists.
- Guest Resume Analyzer completes and clearly remains transient.
- Guest Job Match completes with pasted resume and job description.
- One generative guest tool completes when the live provider is enabled.
- Provider failure shows a readable retry/error state without raw provider text.
- Expired or cleared guest result shows the demo-expired state.

### Authentication

- Email/password registration succeeds.
- Sign out clears sensitive browser session data.
- Sign in restores the authenticated account.
- Google OAuth completes a full state round trip on the deployed callback.
- Password-reset email arrives; reset token is carried in the URL fragment and
  scrubbed after hydration.
- Forced cross-site logout attempt is rejected when `Origin` is not allowed.

### Authenticated Product

- Authenticated Resume Analyzer run saves to history.
- `resume -> job-match -> cover-letter` carries workflow context.
- `resume -> career -> portfolio` carries workflow context.
- History search/filter loads without leaking another user's run.
- Favorite, relabel, workspace pin, regenerate, and delete work.
- TXT, Markdown, and PDF exports work for a saved run.
- Account deletion clears server data and sensitive browser data.

### Operations And Observability

- `/api/v1/health` reports database `ok`.
- Frontend document responses include the deployed CSP and baseline security
  headers.
- Static assets load under the same header posture.
- Sentry receives a scrubbed representative frontend error when enabled.
- Backend logs for a representative tool failure contain categories, not resume
  text, job text, email addresses, cookies, tokens, or full URLs.
- Telemetry accepts allowed event fields and rejects unknown/content-bearing
  fields.
- Rate limiting uses shared storage and emits only pseudonymized or categorical
  identifiers.

## Discovery Source Operations (R14)

Governance and operations for registry-gated job discovery (spec #170, D-084–D-090,
ADR 0008). A source is a governance object, not a config toggle: adding one is a
reviewed decision with a named owner. Ingestion is refused unless a source's terms
review is `accepted` and its kill switch is off; both conditions are re-read on
every fetch, so operator changes take effect immediately with no deploy or restart.

### Source onboarding governance flow

1. **Propose and assign an owner.** Every source has a named owner accountable for
   its terms record. Choose the source in registry preference order: licensed
   APIs/feeds first, then permitted employer/ATS integrations, then allowlisted
   public career pages after terms and robots review, then user-provided URLs/paste.
2. **Register the entry dark.** Create the registry entry (owner, source family,
   allowed behavior, endpoint, allowlisted query parameters, robots policy, rate
   limit, attribution rule, retention days). New entries are always created with
   `terms_status = pending` and the kill switch **on** — never ingesting.
3. **Terms review.** The owner (or legal reviewer) records the terms decision. Only
   an admin reviewer may move `terms_status` to `accepted` or `failed`; the review
   timestamp and reviewer are stamped automatically. A source with `pending` or
   `failed` terms can never ingest, regardless of the kill switch (D-084).
4. **Activation.** Once terms are `accepted`, an admin clears the kill switch to
   activate the source. Clearing the kill switch is refused while terms are not
   accepted, so activation can never outrun permission.
5. **Verify honesty by construction.** Confirm the fetch tier honors robots.txt and
   sends the identifying `CareerWorkbenchDiscovery` user agent, and that outbound
   queries carry only the registry-declared parameters (never profile content).

### Kill procedure (operator)

Use the admin panel to trip or clear a source's kill switch:

1. Open **Admin → Discovery Sources**.
2. For the affected source, click **Trip kill switch**. The next fetch/ingest for
   that source is refused immediately (`kill_switched`) — no deploy or restart. Only
   that one source is affected; discovery continues for every other source.
3. The action is recorded as a bounded operational event
   (`discovery_source_kill_switch`, source family + trip/clear outcome only — no
   source key, name, URL, or user data).
4. To resume, click **Clear kill switch** (enabled only when terms are `accepted`).
5. Watch **Admin → Source Health** for the family's fetch outcomes, staleness,
   listing volume, and dedup/expiry rates to confirm the source is healthy before
   and after a change. All health figures are source-family aggregates only.

Trip a source's kill switch on any terms dispute, source outage, anomalous fetch
failures, or suspected non-compliant behavior. When in doubt, trip first and
investigate — a tripped source degrades discovery gracefully, an unlawful fetch does
not.

## Rollback Rehearsal

For the release candidate, record one successful rollback or forward-fix drill:

- Trigger:
- Decision owner:
- Chosen rollback path:
- Previous frontend/backend build:
- Previous database revision:
- Backup or restore point:
- Commands or dashboard actions used:
- Result:
- Follow-up smoke result:

After rollback, repeat:

- `/api/v1/health`
- landing page load
- authenticated sign-in
- one saved history run load
- one guest tool run

## Trusted Submission Incident Drill (R16)

Before any real submission source activates, execute
[`docs/runbooks/submission-incident.md`](runbooks/submission-incident.md) in isolated
staging against the maintained synthetic source. Name every role, capture the
candidate/database/contract evidence, exercise all limits and controls, rehearse the
rollback and communication paths, and record the resulting playbook version in the
admin surface. An admin rehearsal timestamp without the runbook evidence does not
satisfy the R16 activation gate.

## Incident Contacts

Fill these before private beta:

| Area | Primary | Backup | Escalation path |
|---|---|---|---|
| Deployment | TBD | TBD | TBD |
| Database/backup | TBD | TBD | TBD |
| Privacy/legal | TBD | TBD | TBD |
| Provider billing/LLM | TBD | TBD | TBD |
| OAuth/email | TBD | TBD | TBD |
| Security incident | TBD | TBD | TBD |

## Evidence Log

For each staging or launch rehearsal, append a compact entry:

```text
Date:
Environment:
Frontend commit/build:
Backend commit/build:
Database revision:
Backup/restore point:
Checks run:
Result:
Blockers:
Owner:
Next action:
```
