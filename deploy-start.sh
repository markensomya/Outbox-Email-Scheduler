#!/bin/sh
# ============================================================
# Deployment startup script
# 1. Push Prisma schema to the database (creates/updates tables)
# 2. Start the Express server (which also starts the BullMQ worker
#    and runs startup reconciliation)
# ============================================================

set -e

echo "[deploy] Starting Outbox Email Scheduler..."

# ── Push Prisma schema to database ────────────────────────────
# Prisma has built-in connection retry logic, so no manual health
# check is needed — it will retry connecting to PostgreSQL.
echo "[deploy] Running Prisma db push..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "[deploy] WARNING: Prisma db push failed. The app will start anyway."
  echo "[deploy] Make sure DATABASE_URL is correctly set."
}

# ── Start the server ──────────────────────────────────────────
echo "[deploy] Starting Express server..."
exec node dist/server.js
