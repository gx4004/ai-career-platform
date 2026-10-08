#!/usr/bin/env bash
# Local release gate (#356): frozen installs, lint/test/build, one migration
# upgrade on a disposable database, then the Playwright e2e journeys. Local
# only — no deployment images, no evidence scripts.
set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url=""

while (($#)); do
  case "$1" in
    --database-url)
      (($# >= 2)) || { echo "local release: --database-url requires a value" >&2; exit 2; }
      database_url="$2"
      shift 2
      ;;
    *)
      echo "local release: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
[[ -n "$database_url" ]] || { echo "local release: --database-url is required" >&2; exit 2; }

# Ambient env files must never leak into the gate; move them aside and
# restore them no matter how the run ends.
env_files=(.env backend/.env frontend/.env)
moved_env_files=()
restore_env_files() {
  local f
  ((${#moved_env_files[@]} == 0)) && return 0
  for f in "${moved_env_files[@]}"; do mv "${f}.gate-aside" "$f"; done
}
trap restore_env_files EXIT
for f in "${env_files[@]}"; do
  if [[ -f "$repository_root/$f" ]]; then
    mv "$repository_root/$f" "$repository_root/$f.gate-aside"
    moved_env_files+=("$repository_root/$f")
  fi
done

step() { printf '\n==> %s\n' "$1"; }

step "Install frozen frontend dependencies"
(cd "$repository_root/frontend" && pnpm install --frozen-lockfile)
step "Audit production frontend dependencies"
(cd "$repository_root/frontend" && pnpm audit --prod --audit-level=high)

step "Install locked backend dependencies (if needed)"
(cd "$repository_root/backend" && python3 -m pip install -q -r requirements-dev.txt)
step "Audit production Python dependencies"
python3 -m pip_audit --version >/dev/null 2>&1 || python3 -m pip install pip-audit==2.10.1
# PYSEC-2026-1325 has no fixed ecdsa release; JWTs are constrained to HS256, so
# that optional EC code path is unreachable.
# CVE-2026-85394 requires accepting asymmetric keys as HMAC secrets; this app
# decodes only HS256 with its private shared secret, never a public key.
(cd "$repository_root/backend" && python3 -m pip_audit -r requirements.txt --ignore-vuln PYSEC-2026-1325 --ignore-vuln CVE-2026-85394)

step "Backend Ruff"
(cd "$repository_root/backend" && python3 -m ruff check app)
step "Backend pytest"
(cd "$repository_root/backend" && python3 -m pytest -q)

step "Frontend typecheck"
(cd "$repository_root/frontend" && pnpm typecheck)
step "Frontend unit tests"
(cd "$repository_root/frontend" && pnpm test)
step "Frontend production build"
(cd "$repository_root/frontend" && pnpm build)

step "Require a fresh disposable PostgreSQL database"
psql_url="${database_url/postgresql+psycopg2:/postgresql:}"
if [[ -n "$(psql "$psql_url" -Atqc \
  "select 1 from information_schema.tables where table_schema = 'public' limit 1")" ]]; then
  echo "local release: --database-url must point to an empty database" >&2
  exit 2
fi
step "Alembic upgrade head"
(cd "$repository_root/backend" && DATABASE_URL="$database_url" python3 -m alembic upgrade head)

step "Install Playwright browsers"
(cd "$repository_root/frontend" && pnpm exec playwright install chromium)
(cd "$repository_root/backend" && python3 -m playwright install chromium)

step "Browser tracer journeys"
read -r frontend_port backend_port < <(python3 -c '
import socket
sockets = [socket.socket() for _ in range(2)]
for s in sockets:
    s.bind(("127.0.0.1", 0))
print(sockets[0].getsockname()[1], sockets[1].getsockname()[1])
')
(cd "$repository_root/frontend" && CI=true E2E_DATABASE_URL="$database_url" \
  E2E_FRONTEND_PORT="$frontend_port" E2E_BACKEND_PORT="$backend_port" pnpm test:e2e:ci)

printf '\nLocal release gate passed. The disposable database was intentionally left in place.\n'
