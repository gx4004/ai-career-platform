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
# --proxy-headers takes the client address (rate-limit key) and scheme from
# X-Forwarded-For/-Proto, but only when the connecting peer is listed in
# FORWARDED_ALLOW_IPS (comma-separated IPs or CIDR ranges of every proxy hop in
# front of this service). The default trusts loopback only, so a forged header
# from anywhere else is ignored and limits key on the peer address. Never use '*':
# uvicorn then takes the left-most (client-controlled) X-Forwarded-For entry.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --no-access-log \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}" \
  --timeout-graceful-shutdown "${GRACEFUL_SHUTDOWN_SECONDS:-90}" \
  --limit-concurrency "${LIMIT_CONCURRENCY:-200}" \
  --timeout-keep-alive "${KEEP_ALIVE_SECONDS:-5}"
