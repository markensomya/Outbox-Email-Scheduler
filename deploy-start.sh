#!/bin/sh
# ============================================================
# Deployment startup script
# 1. Wait for PostgreSQL to be reachable
# 2. Push Prisma schema to the database (creates/updates tables)
# 3. Start the Express server (which also starts the BullMQ worker
#    and runs startup reconciliation)
# ============================================================

set -e

echo "[deploy] Starting Outbox Email Scheduler..."

# ── Wait for PostgreSQL ───────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  echo "[deploy] Waiting for PostgreSQL..."
  # Extract host and port from DATABASE_URL for health check
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):\([0-9]*\).*/\1/p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):\([0-9]*\).*/\2/p')

  if [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
    MAX_RETRIES=30
    RETRY=0
    until curl -s "http://${DB_HOST}:${DB_PORT}" >/dev/null 2>&1 || nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
      RETRY=$((RETRY + 1))
      if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "[deploy] WARNING: Could not reach PostgreSQL at ${DB_HOST}:${DB_PORT} after ${MAX_RETRIES} retries. Continuing anyway..."
        break
      fi
      echo "[deploy] Waiting for PostgreSQL... (${RETRY}/${MAX_RETRIES})"
      sleep 2
    done
    echo "[deploy] PostgreSQL is reachable."
  fi
fi

# ── Push Prisma schema to database ────────────────────────────
echo "[deploy] Running Prisma db push..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "[deploy] WARNING: Prisma db push failed. The app will start anyway."
  echo "[deploy] Make sure DATABASE_URL is correctly set."
}

# ── Start the server ──────────────────────────────────────────
echo "[deploy] Starting Express server..."
exec node dist/server.js
