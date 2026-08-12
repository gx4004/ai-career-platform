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
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
