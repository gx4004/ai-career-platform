# Career Workbench - Staging and Launch Runbook

**Status:** R5 prep document; staging execution is blocked until the remaining R3
production decisions and evidence are available.

This runbook is the release-operations checklist for a private beta candidate.
It records what to verify, what evidence to capture, and when to stop. Do not use
it to infer production facts that have not been checked in the deployed
environment.

## Stop Conditions

Do not promote or invite users when any of these are true:

- R3 retention and backup decisions in `docs/threat-model.md` D-UNK-6 or D-UNK-7
  are unresolved.
- Production/staging frontend and backend domains, TLS, credentialed CORS,
  OAuth redirect values, or HSTS compatibility are unverified.
- `RATE_LIMIT_STORAGE_URI` is missing outside development or shared limiter
  storage has not been smoke-tested.
- The current database revision, backup posture, or restore path is unknown.
- Sentry, telemetry, and legal disclosures have not been reconciled with actual
  deployment settings.

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
- `RATE_LIMIT_HMAC_SECRET` is set and distinct from public examples.
- `TRUST_PROXY_HEADERS` and `TRUSTED_PROXY_CIDRS` match Railway evidence.
- `SENTRY_DSN` is either intentionally unset or documented as active.
- Email provider settings are present if password reset must work.
- Vertex/Gemini credentials are present with the accepted permission scope.

Frontend settings to verify:

- `VITE_API_URL` points at the deployed API route.
- `SECURITY_HSTS_ENABLED` remains off until TLS/domain evidence is accepted.
- Sentry/PostHog settings match the legal disclosure decision.
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
