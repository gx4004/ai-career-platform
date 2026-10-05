#!/bin/sh
set -e

# Only run migrations if RUN_MIGRATIONS is set (default: true for first instance)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running migrations..."
  # A migration failure leaves the schema contract unknown. `set -e` keeps the
  # instance out of service instead of launching against a partial schema.
  alembic upgrade head
  echo "Migrations step complete."
fi

echo "Starting server..."
# --no-access-log: uvicorn's access line carries the query string and client address;
# the app emits its own structured request line without either (see main.py).
# --timeout-graceful-shutdown lets in-flight (LLM) requests finish on a deploy;
# --limit-concurrency sheds load with 503 instead of queueing without bound.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --no-access-log \
  --timeout-graceful-shutdown "${GRACEFUL_SHUTDOWN_SECONDS:-90}" \
  --limit-concurrency "${LIMIT_CONCURRENCY:-200}" \
  --timeout-keep-alive "${KEEP_ALIVE_SECONDS:-5}"
