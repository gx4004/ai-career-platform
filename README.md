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

Prerequisites:

- Node.js 22 and pnpm 10.30.3
- Python 3.12
- PostgreSQL 16 when verifying the complete migration history

### Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Default frontend URL: `http://localhost:3000`

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Set DATABASE_URL in .env to a PostgreSQL 16 database before migrating.
alembic upgrade head
uvicorn app.main:app --reload
```

Default backend URL: `http://localhost:8000`
Default API prefix: `http://localhost:8000/api/v1`

The backend example retains SQLite as a lightweight application-development
default, but SQLite cannot replay the full Alembic history. Use a disposable
PostgreSQL 16 database for clean setup and migration verification:

```bash
cd backend
DATABASE_URL=postgresql+psycopg2://<user>:<password>@<host>/<database> \
  alembic upgrade head
```

## Environment

Use [`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example) as the authoritative setting
inventories. At minimum, set a non-default backend `SECRET_KEY` and configure
`DATABASE_URL` for the intended database.

The V1 generation provider is Vertex AI. Local generative workflows require valid
`VERTEX_PROJECT_ID` and `VERTEX_LOCATION` values plus working Google Cloud
credentials. Provider-backed smoke tests are currently blocked by
[issue #51](https://github.com/gx4004/ai-career-platform/issues/51). Automated tests
mock AI responses and do not require live Vertex access.

Notes:

- Keep `.env` files out of version control.
- Rotate any real API key that was ever committed or shared.
- Use `.env.example` as the source of truth for local setup.

## Launch Readiness

- Operator checklist: [docs/launch-checklist.md](docs/launch-checklist.md)
- Product QA checklist: [docs/qa-checklist.md](docs/qa-checklist.md)

## Verification Commands

```bash
cd frontend
pnpm typecheck
pnpm test
pnpm build

cd ../backend
ruff check app
pytest -q
```
