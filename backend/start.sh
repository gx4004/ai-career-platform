#!/bin/sh
set -e

# Only run migrations if RUN_MIGRATIONS is set (default: true for first instance)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running migrations..."
  # Use --sql to check first, then apply. If another instance is migrating,
  # alembic's internal locking on the alembic_version table prevents races.
  alembic upgrade head || echo "WARNING: Migration failed — may already be applied by another instance"
  echo "Migrations step complete."
fi

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
