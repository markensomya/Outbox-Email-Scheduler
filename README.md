# Outbox — Email Scheduler

A self-hosted email scheduling service with a React dashboard. Schedule bulk email campaigns, track delivery, search across sent mail, and get Slack alerts when rate limits are hit.

**Live demo:** https://outbox-app-production.up.railway.app

---

## What it does

- Schedule emails to send at a future time — no cron jobs, no polling
- Upload a CSV or TXT file of recipient addresses and batch-schedule them all at once
- Enforces per-sender hourly rate limits and minimum delay between sends
- Sends a Slack message the first time a sender hits their hourly cap (not once per email — just once)
- Full-text search across all scheduled and sent mail
- Live queue dashboard showing active, delayed, waiting, and failed jobs

---

## Stack

| Layer | Tech |
|-------|------|
| API server | Node.js, TypeScript, Express |
| Job queue | BullMQ + Redis |
| Database | PostgreSQL (Prisma ORM) |
| Search | Elasticsearch |
| Email delivery | Resend HTTP API |
| Auth | Google OAuth 2.0 + JWT |
| Frontend | React (Vite), Tailwind CSS |
| Infrastructure | Docker Compose (local) / Railway (deployed) |

---

## Running locally

### 1. Start backing services

```bash
docker-compose up -d
```

Starts PostgreSQL on `5432`, Redis on `6379`, and Elasticsearch on `9200`. Data is persisted in named Docker volumes so it survives restarts.

### 2. Backend

```bash
cd backend
cp .env.example .env
# fill in .env — see section below
npm install
npx prisma db push
npm run dev
```

Server starts at `http://localhost:4000`. The BullMQ worker runs in the same process in dev mode.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Dashboard at `http://localhost:5173`.

### 4. Queue monitor

`http://localhost:4000/admin/queues` — live view of every job in the queue.

---

## Environment variables

### Backend (`backend/.env`)

```
PORT=4000
DATABASE_URL=postgresql://outbox:outbox_password@localhost:5432/outbox_scheduler
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

JWT_SECRET=pick-something-long
SESSION_SECRET=pick-something-else-long

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

RESEND_API_KEY=
RESEND_FROM_EMAIL=onboarding@resend.dev

WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=100
```

### Frontend (`frontend/.env`)

```
VITE_API_URL=http://localhost:4000
```

---

## Setting up OAuth

### Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth client ID (Web application)
3. Add redirect URI: `http://localhost:4000/api/auth/google/callback`
4. Copy client ID and secret into `backend/.env`

For the deployed version, use `https://your-domain/api/auth/google/callback`.

### Slack (optional)

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add scopes: `chat:write`, `incoming-webhook`
3. Add redirect URI: `http://localhost:4000/api/slack/callback`
4. Copy client ID and secret into `backend/.env`

Connect Slack from the dashboard header once logged in.

### Email (Resend)

Get a free API key at [resend.com](https://resend.com) (3,000 emails/month on free tier). Set `RESEND_API_KEY` in `.env`. Without a key the app runs in demo mode — emails are simulated and marked SENT without actually delivering.

---

## How scheduling works

When you submit the compose form, the API:

1. Creates a row in PostgreSQL for each recipient (`status = SCHEDULED`)
2. Adds a BullMQ delayed job with `jobId = email.id` and a delay calculated from the scheduled time

When the delay elapses, the worker:

1. Runs `UPDATE "Email" SET status='PROCESSING' WHERE id=? AND status='SCHEDULED' RETURNING id` — if 0 rows come back, the job is skipped (already handled)
2. Checks the per-sender hourly counter in Redis (`INCR rate_limit:<sender>:<YYYY-MM-DD-HH>`)
3. If over the limit, reschedules the job to the next hour window with a random 0–60 second offset (prevents all jobs from firing at exactly :00:00), updates DB status to `RATE_LIMITED_RESCHEDULED`, and sends one Slack alert per sender per hour
4. Checks the per-sender minimum delay using a Redis Lua script (atomic check-and-set)
5. Sends the email via Resend
6. Updates PostgreSQL to `SENT` and re-indexes in Elasticsearch

On server restart, a reconciliation pass runs before the worker starts. It resets any rows stuck in `PROCESSING`, re-enqueues any `SCHEDULED` rows whose Redis job is missing, and normalizes past-due `RATE_LIMITED_RESCHEDULED` rows back to `SCHEDULED`.

---

## Architecture

```
Browser
  │
  ▼
React Dashboard (Vite)
  │  - Compose modal with CSV upload
  │  - Scheduled / Sent email tables
  │  - Elasticsearch search bar
  │  - Slack connect button
  ▼
Express API  ──────────────────────────────────────────┐
  │                                                    │
  ├─ POST /api/emails/schedule                         │
  │    writes to PostgreSQL + enqueues BullMQ job      │
  │                                                    │
  ├─ GET  /api/emails/search                           │
  │    queries Elasticsearch                           │
  │                                                    │
  ├─ GET  /api/slack/auth  (OAuth redirect)            │
  └─ GET  /api/slack/callback                          │
                                                       │
BullMQ Worker (same process in dev, separate in prod)  │
  │                                                    │
  ├─ Atomic idempotency check (Postgres raw UPDATE)    │
  ├─ Rate limit check (Redis INCR + EXPIRE)            │
  ├─ Min-delay lock (Redis Lua EVALSHA)                │
  ├─ Send via Resend HTTP API                          │
  ├─ Update Postgres → SENT                            │
  └─ Index in Elasticsearch                            │
                                                       │
/admin/queues  ─────────────────────────────────────────
  Bull Board live queue monitor
```

---

## Deploying to Railway

The repo includes a `Dockerfile` and `railway.json`. To deploy your own copy:

```bash
npm install -g @railway/cli
railway login
railway init
railway add --database postgres
railway add --database redis
railway add --image "docker.elastic.co/elasticsearch/elasticsearch:8.13.4" \
  --service elasticsearch \
  --variables "discovery.type=single-node" \
  --variables "xpack.security.enabled=false" \
  --variables "ES_JAVA_OPTS=-Xms256m -Xmx256m"
railway up --service your-app-service
```

Set environment variables via `railway variable set KEY=value --service your-app-service`.

---

## Project structure

```
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── config/          # env, redis, elasticsearch clients
│       ├── auth/            # Google OAuth strategy, JWT middleware
│       ├── queues/          # BullMQ queue definition, worker, Bull Board
│       ├── routes/          # auth, emails, slack, search
│       ├── services/        # email scheduling, rate limiting, ES indexing, Slack alerts
│       └── utils/           # logger, sender config
├── frontend/
│   └── src/
│       ├── api/             # typed API client with Bearer token support
│       ├── components/      # Header, Sidebar, EmailTable, ComposeModal, etc.
│       └── context/         # AuthContext (handles OAuth token from URL)
├── docker-compose.yml
└── Dockerfile               # multi-stage: builds frontend + backend, serves both
```

---

## Notes

- The app uses Redis AOF persistence (`appendonly yes`) so delayed jobs survive Redis restarts
- PostgreSQL is the source of truth — Redis only holds queue state and rate limit counters
- Elasticsearch is a secondary index — if it goes down, scheduling and delivery still work; search just returns empty until ES recovers
- Worker concurrency is configurable via `WORKER_CONCURRENCY` (default 5); rate limiting uses Redis atomics so multiple workers don't double-count sends
- The minimum delay between sends is enforced with a Lua script loaded into Redis, making it safe across concurrent workers
