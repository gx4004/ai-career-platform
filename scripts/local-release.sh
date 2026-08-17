#!/usr/bin/env bash

set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="full"
plan_only=false
allow_missing_docker=false
containers_available=true
database_url=""
authorization_database_url=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/local-release.sh --preflight
  ./scripts/local-release.sh --plan --database-url URL --authorization-database-url URL
  ./scripts/local-release.sh --database-url URL --authorization-database-url URL

Full and plan modes require two explicit, disposable PostgreSQL URLs: the main
database must be named cw_local_release or cw_local_release_*, and the isolated
authorization proof database must be named
codex_submission_authorization_concurrency_*. The runner never reads ambient
database URLs and never drops a database.

Docker is required by default so the gate produces deployment-image evidence.
Pass --allow-missing-docker to run every other gate on a host without a reachable
Docker daemon; the run then reports that it produced no container evidence and
says so again in its final result line.
EOF
}

die_usage() {
  printf 'local release: %s\n' "$1" >&2
  usage >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --preflight)
      mode="preflight"
      shift
      ;;
    --plan)
      plan_only=true
      shift
      ;;
    --allow-missing-docker)
      allow_missing_docker=true
      shift
      ;;
    --database-url)
      (($# >= 2)) || die_usage "--database-url requires a value"
      database_url="$2"
      shift 2
      ;;
    --authorization-database-url)
      (($# >= 2)) || die_usage "--authorization-database-url requires a value"
      authorization_database_url="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die_usage "unknown argument: $1"
      ;;
  esac
done

if [[ "$mode" == "full" && -z "$database_url" ]]; then
  die_usage "full release mode requires --database-url"
fi

if [[ "$mode" == "full" && -z "$authorization_database_url" ]]; then
  die_usage "full release mode requires --authorization-database-url"
fi

if [[ "$mode" == "preflight" && ( -n "$database_url" || -n "$authorization_database_url" ) ]]; then
  die_usage "database URLs are not used with --preflight"
fi

# Never allow an ambient or .env-exported target to select a destructive gate.
# Database-bearing commands receive only the URL parsed from --database-url.
unset DATABASE_URL E2E_DATABASE_URL LOCAL_RELEASE_DATABASE_URL

if [[ "$mode" == "full" ]]; then
  if ! LOCAL_RELEASE_DATABASE_URL="$database_url" \
    python3 "$repository_root/scripts/validate-release-database.py"; then
    exit 2
  fi
  if ! LOCAL_RELEASE_DATABASE_URL="$authorization_database_url" \
    python3 "$repository_root/scripts/validate-release-database.py" \
      --profile authorization-concurrency; then
    exit 2
  fi
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'local release: required command is missing: %s\n' "$1" >&2
    exit 1
  }
}

verify_runtime_contract() {
  local node_version pnpm_version python_version

  require_command node
  require_command pnpm
  require_command python3

  node_version="$(node --version)"
  [[ "$node_version" == v22.* ]] || {
    printf 'local release: Node.js 22.x required; found %s (see .nvmrc)\n' "$node_version" >&2
    exit 1
  }

  pnpm_version="$(pnpm --version)"
  [[ "$pnpm_version" == "10.30.3" ]] || {
    printf 'local release: pnpm 10.30.3 required; found %s\n' "$pnpm_version" >&2
    exit 1
  }

  python_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  [[ "$python_version" == "3.12" ]] || {
    printf 'local release: Python 3.12 required; found %s (see .python-version)\n' \
      "$python_version" >&2
    exit 1
  }
  python3 -m pip --version >/dev/null
  if ! python3 -c 'import sys; raise SystemExit(0 if sys.prefix != sys.base_prefix else 1)'; then
    printf 'local release: activate a Python 3.12 virtual environment before installing dependencies\n' >&2
    exit 1
  fi

  require_command pdftotext
  if ! command -v soffice >/dev/null 2>&1 && ! command -v libreoffice >/dev/null 2>&1; then
    printf 'local release: LibreOffice (soffice or libreoffice) is required for document QA\n' >&2
    exit 1
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    containers_available=true
  elif [[ "$allow_missing_docker" == true ]]; then
    containers_available=false
  else
    printf 'local release: Docker is required and its daemon must be reachable so the gate can build and inspect both deployment images; install or start Docker, or pass --allow-missing-docker to run every other gate without container evidence\n' >&2
    exit 1
  fi

  printf 'Runtime preflight passed: Node %s, pnpm %s, Python %s.\n' \
    "${node_version#v}" "$pnpm_version" "$python_version"

  if [[ "$containers_available" != true ]]; then
    announce_container_skip
  fi
}

announce_container_skip() {
  printf '\n==> Container verification SKIPPED\n'
  printf '    Docker is unavailable and --allow-missing-docker was passed, so this\n'
  printf '    run produces no container evidence: neither deployment image is built\n'
  printf '    and neither non-root runtime user is inspected.\n'
}

verify_container() {
  local name="$1"
  local expected_user="$2"
  local image="career-workbench-${name}:local-release"
  local runtime_user runtime_uid

  printf '\n==> Build and inspect %s deployment image\n' "$name"
  if [[ "$plan_only" == true ]]; then
    printf '    '
    print_command docker build --file "$name/Dockerfile" --tag "$image" "$name"
    printf '\n    '
    print_command docker image inspect --format '{{.Config.User}}' "$image"
    printf '\n    '
    print_command docker run --rm "$image" id -u
    printf '\n'
    return
  fi

  if ! (cd "$repository_root" && docker build \
    --file "$name/Dockerfile" --tag "$image" "$name"); then
    printf 'local release: FAILED — build %s deployment image\n' "$name" >&2
    exit 1
  fi
  runtime_user="$(docker image inspect --format '{{.Config.User}}' "$image")"
  [[ "$runtime_user" == "$expected_user" ]] || {
    printf 'local release: %s image user must be %s; found %s\n' \
      "$name" "$expected_user" "${runtime_user:-<empty>}" >&2
    exit 1
  }
  runtime_uid="$(docker run --rm "$image" id -u)"
  [[ "$runtime_uid" != "0" ]] || {
    printf 'local release: %s image runs as root\n' "$name" >&2
    exit 1
  }
}

print_command() {
  local argument
  for argument in "$@"; do
    printf '%q ' "$argument"
  done
}

run_in_directory() {
  local label="$1"
  local directory="$2"
  shift 2
  printf '\n==> %s\n' "$label"
  if [[ "$plan_only" == true ]]; then
    printf '    (cd %s && ' "$directory"
    print_command "$@"
    printf ')\n'
    return
  fi
  if ! (cd "$repository_root/$directory" && "$@"); then
    printf 'local release: FAILED — %s\n' "$label" >&2
    exit 1
  fi
}

run_with_database() {
  local environment_name="$1"
  local selected_database_url="$2"
  local redacted_url="$3"
  local label="$4"
  local directory="$5"
  shift 5
  printf '\n==> %s\n' "$label"
  if [[ "$plan_only" == true ]]; then
    printf '    (cd %s && %s=%s ' "$directory" "$environment_name" "$redacted_url"
    print_command "$@"
    printf ')\n'
    return
  fi
  if [[ "$environment_name" == "DATABASE_URL" ]]; then
    if ! (cd "$repository_root/$directory" && DATABASE_URL="$selected_database_url" "$@"); then
      printf 'local release: FAILED — %s\n' "$label" >&2
      exit 1
    fi
  elif [[ "$environment_name" == "LOCAL_RELEASE_DATABASE_URL" ]]; then
    if ! (
      cd "$repository_root/$directory" && \
        LOCAL_RELEASE_DATABASE_URL="$selected_database_url" "$@"
    ); then
      printf 'local release: FAILED — %s\n' "$label" >&2
      exit 1
    fi
  else
    printf 'local release: unsupported database environment: %s\n' "$environment_name" >&2
    exit 1
  fi
}

run_e2e() {
  local label="Browser tracer journeys"
  printf '\n==> %s\n' "$label"
  if [[ "$plan_only" == true ]]; then
    printf '    (cd frontend && CI=true E2E_DATABASE_URL=<disposable-postgresql-url> '
    print_command pnpm test:e2e:ci
    printf ')\n'
    return
  fi
  if ! (
    cd "$repository_root/frontend" && \
      CI=true E2E_DATABASE_URL="$database_url" pnpm test:e2e:ci
  ); then
    printf 'local release: FAILED — %s\n' "$label" >&2
    exit 1
  fi
}

if [[ "$plan_only" == true ]]; then
  printf 'Local release plan (%s). Runtime contract: Node 22.x, pnpm 10.30.3, Python 3.12.\n' \
    "$mode"
  if [[ "$allow_missing_docker" == true ]]; then
    containers_available=false
  fi
else
  verify_runtime_contract
fi

if [[ "$mode" == "preflight" ]]; then
  exit 0
fi

run_in_directory "Install frozen frontend dependencies" frontend \
  pnpm install --frozen-lockfile
run_in_directory "Audit production frontend dependencies" frontend \
  pnpm audit --prod --audit-level=high
run_in_directory "Frontend typecheck" frontend pnpm typecheck
run_in_directory "Frontend unit and server tests" frontend pnpm test
run_in_directory "Frontend production artifact and process smoke" frontend \
  pnpm test:production-smoke

run_in_directory "Upgrade pip" backend python3 -m pip install --upgrade pip
run_in_directory "Install locked backend dependencies" backend \
  python3 -m pip install -r requirements-dev.txt
run_in_directory "Install pinned Python auditor" backend \
  python3 -m pip install pip-audit==2.10.1
run_in_directory "Verify installed Python dependency consistency" backend \
  python3 -m pip check
run_in_directory "Audit production Python dependencies" backend \
  python3 -m pip_audit -r requirements.txt --ignore-vuln PYSEC-2026-1325
run_in_directory "Backend Ruff" backend python3 -m ruff check app

if [[ "$containers_available" == true ]]; then
  verify_container frontend node
  verify_container backend appuser
else
  announce_container_skip
fi

run_with_database LOCAL_RELEASE_DATABASE_URL "$database_url" \
  '<disposable-postgresql-url>' "Require a fresh disposable PostgreSQL database" . \
  python3 scripts/validate-release-database.py --require-empty
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Stable-release cumulative migration round trip" backend \
  python3 tests/migration_stable_release_roundtrip.py
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Populated packet-approval migration round trip" backend \
  python3 tests/migration_packet_approval_roundtrip.py
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Populated submission migration round trip" backend \
  python3 tests/migration_submission_roundtrip.py
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Populated operational-metric migration round trip" backend \
  python3 tests/migration_operational_metric_roundtrip.py
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Alembic upgrade smoke" backend \
  python3 -m alembic upgrade head
run_with_database DATABASE_URL "$database_url" '<disposable-postgresql-url>' \
  "Concurrent submission retry proof" backend \
  python3 tests/postgres_submission_concurrency.py

run_with_database LOCAL_RELEASE_DATABASE_URL "$authorization_database_url" \
  '<authorization-concurrency-postgresql-url>' \
  "Require a fresh authorization-concurrency database" . \
  python3 scripts/validate-release-database.py \
    --profile authorization-concurrency --require-empty
run_with_database DATABASE_URL "$authorization_database_url" \
  '<authorization-concurrency-postgresql-url>' \
  "Prepare authorization-concurrency database" backend \
  python3 -m alembic upgrade head
run_with_database DATABASE_URL "$authorization_database_url" \
  '<authorization-concurrency-postgresql-url>' \
  "Concurrent submission-authorization proof" backend \
  python3 tests/postgres_submission_authorization_concurrency.py

run_in_directory "Backend startup process smoke" backend \
  python3 -m pytest -q tests/test_startup_script.py
run_in_directory "Backend pytest" backend python3 -m pytest -q
run_in_directory "Install Playwright Chromium" frontend pnpm exec playwright install chromium
run_e2e

if [[ "$containers_available" == true ]]; then
  container_result=''
else
  container_result=' WITHOUT container evidence'
fi

if [[ "$plan_only" == true ]]; then
  printf '\nLocal release plan complete%s. No gate commands or database connections were run.\n' \
    "$container_result"
else
  printf '\nLocal release gate passed%s. Both disposable databases were intentionally left in place.\n' \
    "$container_result"
fi
