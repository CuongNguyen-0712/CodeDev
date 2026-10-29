<h1 align="center">CodeDev</h1>

<p align="center">
  A learning platform for programmers: structured courses, quizzes, sandboxed coding challenges,
  learning roadmaps, EXP levels and rankings.
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232a?logo=react">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis&logoColor=white">
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white">
  <img alt="Deployed on Vercel" src="https://img.shields.io/badge/deploy-Vercel-black?logo=vercel">
</p>

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)

## Features

| Area | What it does |
|---|---|
| **Courses** | Catalog with filters, prerequisites, skills and career roles; lessons authored in Sanity with diagrams on Cloudinary; free and premium access models |
| **Challenges** | Quizzes (single / multiple choice) and coding challenges in JavaScript, Python, C++, Java, Go and Rust; quick runs in a browser Web Worker, submissions graded server-side in an isolated sandbox; tiered hints |
| **Progress & rewards** | Points ledger, EXP ledger with 20 levels, achievements, course completion rules, leaderboard (`/ranking`) |
| **Roadmaps** | Ordered learning paths made of courses, with per-user progress |
| **Onboarding** | Personalised recommendations from role, industry, goals and skill level (`/api/recommendations`) |
| **Commerce** | Offers, orders, payments (mock provider in development), course entitlements, point redemption |
| **Accounts** | Credentials, GitHub and Google sign-in; email verification; linked providers; device sessions with remote revocation; rate-limited login |
| **Realtime** | Pusher channels for session events and notifications |
| **Admin** | Users, courses and offers, entitlements, orders and refunds, point / EXP adjustments, content KPIs, append-only audit log |

## Architecture

```
                  ┌───────────────────────────────┐
  Browser ──────▶ │  Next.js 16 (App Router)      │ ─────▶ Sanity   (lesson content)
                  │  proxy.js   session guard     │ ─────▶ Cloudinary (images)
                  │  app/api    route handlers    │ ─────▶ Pusher   (realtime)
                  │  actions/   server actions    │ ─────▶ SMTP     (mail)
                  │  services/  business logic    │
                  │  db/        query modules     │
                  └──────┬───────────┬────────────┘
                         │           │
          ┌──────────────┘           └───────────────┐
          ▼                                          ▼
   PostgreSQL (Neon)      Redis (Upstash)      S3 storage (Neon S3 / MinIO)
   schema + SQL API       cache, rate limits   submissions, starters, assets
   migrations in db/      session cache        public + private buckets

   Coding submission ──▶ code runner (Docker `codedev_sandbox` or Vercel Sandbox)
                         compile once, one process per test, limits from the challenge
```

Key design points:

- **Single source of truth per concern.** Schema changes only through `db/migrations/`; course
  content only through `content/` and its pipeline; environment wiring only through
  `lib/appEnv.mjs`.
- **Secure by default.** HttpOnly session JWT (JWE) plus rotating refresh tokens stored as hashes,
  stolen-token detection, same-origin checks on state-changing requests, permissions checked in
  the database for admin APIs. See [docs/auth.md](docs/auth.md).
- **Degrades, does not fall over.** Redis outages switch to an in-memory LRU with a circuit
  breaker; storage outages only disable coding challenges. `GET /api/health` reports
  `ok` / `degraded` / `down`.
- **Grading you can trust.** With a code runner configured the server produces the outputs
  itself and ignores anything the browser reports. See [docs/sandbox.md](docs/sandbox.md).

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| UI | Tailwind CSS 4, Radix UI, sonner, react-icons, react-syntax-highlighter |
| Data fetching | TanStack Query, server actions |
| Auth | NextAuth 4 (credentials, GitHub, Google), `jose` JWE sessions, bcryptjs |
| Database | PostgreSQL 16+ (Neon serverless driver in production, `pg` locally) |
| Cache | Redis (Upstash REST in production, ioredis locally) |
| Storage | S3-compatible (`@aws-sdk/client-s3`): Neon S3 in production, MinIO locally |
| Content | Sanity (Studio at `/studio`), Cloudinary |
| Realtime | Pusher |
| Mail | Nodemailer, React Email (Mailpit locally, Gmail SMTP in production) |
| Code runner | Docker image `codedev_sandbox` (Node 24, Python 3.14, gcc 15, JDK 21, Go 1.26, Rust 1.93) or Vercel Sandbox |
| Validation | zod |
| Tests | Vitest |

## Getting started

### Prerequisites

- Node.js 24 and npm
- Docker with Compose (Redis, MinIO, Mailpit and the code sandbox)
- PostgreSQL 16+ running on the host, or the `db` compose profile (port 5433)

### Setup

```bash
git clone https://github.com/CuongNguyen-0712/CodeDev.git
cd CodeDev
npm install
cp .env.example .env.local      # fill in the values, see "Configuration"
npm run services:up             # redis + minio + mailpit + sandbox + gateway
npm run db:migrate              # apply db/migrations to DATABASE_URL
npm run storage:init            # create the public / private buckets
npm run dev                     # http://localhost:3000
```

Useful while developing:

| URL | What |
|---|---|
| http://localhost:3000/api/health | Database, cache and storage status |
| http://127.0.0.1:8025 | Mailpit inbox (every email sent in development) |
| http://127.0.0.1:9001 | MinIO console |
| http://localhost:3000/studio | Sanity Studio |

Stop the containers with `npm run services:down`. Never run `docker compose down -v` unless you
mean to delete the local data volumes.

## Configuration

All variables are documented in [`.env.example`](.env.example); real values live in `.env.local`
(development) or Vercel project settings (production) and are never committed.

| Group | Variables |
|---|---|
| App | `APP_ENV`, `NEXT_PUBLIC_API_URL`, `MACHINE_ID` |
| Auth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `REFRESH_TOKEN_HASH_SECRET`, `GITHUB_ID` / `GITHUB_SECRET`, `GOOGLE_ID` / `GOOGLE_SECRET` |
| Mail | `MAIL_FROM`, `MAIL_PASSWORD`, optional `MAIL_HOST` / `MAIL_PORT` |
| Database | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` |
| Redis | `REDIS_URL`, `REDIS_TOKEN` |
| Storage | `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `MINIO_*` or `AWS_*` |
| Code runner | `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN`, or `CODE_RUNNER_PROVIDER=vercel` |
| Realtime | `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*` |
| Content | `NEXT_PUBLIC_SANITY_*`, `SANITY_API_TOKEN`, `CLOUDINARY_*` |

`instrumentation.js` validates the wiring at server start and refuses to run production against
local or development services. Details: [docs/environments.md](docs/environments.md).

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server with Turbopack |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest suites in `__tests__/` |
| `npm run services:up` / `services:down` | Local containers (`compose.yml`, profile `dev`) |
| `npm run docker:app` | Production-like container of the app (profile `app`, `.env.production`) |
| `npm run db:migrate` / `db:migrate:prod` | Apply pending SQL migrations (development / production) |
| `npm run db:compare` | Read-only schema drift check between two databases |
| `npm run db:export` | Regenerate `db/functions`, `views`, `triggers` and `schema.dbml` from a live database |
| `npm run storage:init` / `storage:sync` | Create buckets / copy objects between storage providers |
| `npm run mail:test -- --env <file> --to <you>` | Send a test email with that env file's mail settings |

## Project structure

```
app/              Routes and API handlers (home, course, learning, roadmap, ranking, profile,
                  settings, onboarding, checkout, orders, admin, studio, auth, api/*)
components/       UI components (Tailwind 4, Radix)
hooks/ contexts/  Client hooks and providers
actions/          Server actions            mutations/ queries/   React Query hooks
services/         Business logic (auth, course, challenge, commerce, experience, ranking, ...)
db/               Query modules, schema.sql, migrations/, generated schema files, tools/
lib/              Shared code: session/JWT, cache, rate limits, S3, mail, Sanity, Pusher, env
auth/             Route access config and permission helpers
content/          Course source of truth + pipeline to Postgres, Sanity, storage, Cloudinary
sandbox/          Code runner image, gateway and runner
sanity/           Sanity schema; Studio mounted at /studio
scripts/          storage-sync.mjs, mail-test.mjs
__tests__/        Vitest suites (tests/ is git-ignored scratch)
docs/             Design and operations documents
proxy.js          Request guard: session validation, redirects, verify lock
instrumentation.js  Startup environment check
compose.yml       Every container (redis, minio, mailpit, postgres, sandbox, gateway, app)
```

## Testing

```bash
npm test
```

Integration tests run against the database in `DATABASE_URL` from `.env.local`, one file at a
time (they share one database). Redis and Pusher are never touched: the in-memory fallback is
used. Storage tests run against the local MinIO when it is reachable and skip otherwise.

## Deployment

**Vercel** hosts the production site. `vercel.json` schedules two crons:
account maintenance (`/api/internal/account-maintenance`, daily 03:00 UTC) and the EXP audit
(`/api/internal/exp-audit`, daily 03:30 UTC). Coding submissions are graded on Vercel Sandbox
(`CODE_RUNNER_PROVIDER=vercel`).

Release checklist:

1. `npm run db:migrate:prod -- --yes`, then `npm run db:compare` must report "in sync".
2. Push the branch; Vercel builds from it.
3. Check `/api/health` on the deployment.

**Self-hosting**: `npm run docker:app` builds a standalone, non-root Node 24 image (`Dockerfile`)
and starts it with Redis and the sandbox from `compose.yml`. See [docs/docker.md](docs/docker.md).

There is no CI pipeline in the repository.

## Documentation

| Document | Covers |
|---|---|
| [docs/environments.md](docs/environments.md) | Development vs production services, startup guards |
| [docs/docker.md](docs/docker.md) | Containers, networks, volumes, the production image |
| [docs/auth.md](docs/auth.md) | Credentials, refresh tokens, OAuth, session revocation |
| [docs/sandbox.md](docs/sandbox.md) | How coding submissions are executed and graded |
| [db/README.md](db/README.md) | Schemas, migrations, generated files, tools |
| [content/README.md](content/README.md) | Course content layout and publishing pipeline |
| [docs/development-plan.md](docs/development-plan.md) | Current state and roadmap (Vietnamese) |
| [docs/security-audit-2026-10-27.md](docs/security-audit-2026-10-27.md) | Latest security audit |

## License

Private project. All rights reserved.
