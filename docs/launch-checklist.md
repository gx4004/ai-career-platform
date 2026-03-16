# Launch Checklist

## Environment

- Copy `backend/.env.example` to `backend/.env`
- Confirm `SECRET_KEY` is not the default placeholder
- Confirm only one LLM provider is intentionally configured
- Confirm no live secrets are committed or shared

## Backend

- Run `alembic upgrade head`
- Start `uvicorn app.main:app --reload`
- Confirm `GET /api/v1/health` returns healthy status
- Confirm telemetry ingestion accepts `POST /api/v1/telemetry/events`

## Frontend

- Run `pnpm dev`
- Confirm `VITE_API_URL` points to the local backend if overridden
- Confirm landing page copy matches guest demo behavior

## Smoke Test

- Run one guest demo and verify it is not saved to history
- Sign in, rerun one tool, and verify it appears in workspace history
- Export one result as TXT and Markdown
- Resume a saved workspace from the history page

## Rollback Basics

- Keep the prior database file or backup before running migrations in shared environments
- If a deploy is reverted, confirm frontend and backend are on compatible schema versions
- Re-run the smoke test after rollback
