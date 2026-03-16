# Career Workbench

Career Workbench is a full-stack job-search workspace built around six connected tools:

- `resume` and `job-match` for explainable analysis
- `cover-letter` and `interview` for application outputs
- `career` and `portfolio` for planning and proof-building

The app supports guest demo runs, authenticated workspace persistence, exportable results, and a workspace timeline that links related runs together.

## Structure

```text
├── frontend/   React 19 + TanStack Start
├── backend/    FastAPI + SQLAlchemy + Alembic
└── docs/       Launch and QA checklists
```

## Local Setup

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Default frontend URL: `http://localhost:3000`

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Default backend URL: `http://localhost:8000`
Default API prefix: `http://localhost:8000/api/v1`

## Environment

Backend `.env` values:

- `DATABASE_URL`
- `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `ALGORITHM`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`
- `ENVIRONMENT`

Notes:

- Keep `.env` files out of version control.
- Rotate any real API key that was ever committed or shared.
- Use `.env.example` as the source of truth for local setup.

## Launch Readiness

- Operator checklist: [docs/launch-checklist.md](docs/launch-checklist.md)
- Product QA checklist: [docs/qa-checklist.md](docs/qa-checklist.md)

## Verification Commands

```bash
cd backend && ./.venv/bin/pytest
cd frontend && pnpm test
cd frontend && pnpm build
```
