# Environments

Two deployment environments, each wired to its own services. `APP_ENV` (default: from `NODE_ENV`)
decides which; `lib/appEnv.mjs` is the single definition used by the app, the tests and `scripts/`.

| | development | production |
|---|---|---|
| Started by | `next dev`, scripts, vitest (`APP_ENV=test`) | Vercel / `next start` / Docker |
| Env files | `.env.local` > `.env` | Vercel project settings, or `.env.production` > `.env` |
| PostgreSQL | local (`pg` driver) | Neon (serverless driver) |
| Redis | local container (`npm run services:up`, `compose.yml`) | Upstash |
| Object storage | **MinIO** (`compose.yml` profile `dev`, `MINIO_ENDPOINT`) | **Neon S3** (`AWS_ENDPOINT_URL_S3`) |
| Mail | Mailpit (`compose.yml` profile `dev`, inbox `http://127.0.0.1:8025`; `MAIL_PASSWORD` empty) | Gmail `smtp.gmail.com:465` (`MAIL_FROM` + `MAIL_PASSWORD`) |
| Code runner | `compose.yml` profile `dev` (`CODE_RUNNER_URL=http://127.0.0.1:4100`) | optional; browser-reported grading when unset ([sandbox.md](sandbox.md)) |
| Images (Cloudinary) | folder `codedev/development/...` | folder `codedev/production/...` |
| Schema | `npm run db:migrate` | `npm run db:migrate:prod -- --yes`; `npm run db:compare` must report "in sync" |
| Buckets | `public`, `private` | `public`, `private` |

`.env.local` is loaded by `next start` too, and it sets `APP_ENV=development`: a production build
run on this machine still uses the local services. `.dockerignore` keeps every `.env*` file out of
the Docker build context (the container gets its configuration from `env_file` at run time, see
[docker.md](docker.md)), and Vercel never sees the git-ignored files.

## Guards

`instrumentation.js` checks the wiring once at server start (`lib/envCheck.mjs`), naming
variables, never values:

- **fatal in production**: storage on the development MinIO or on a local endpoint,
  `NEXTAUTH_URL` without https.
- **error, logged**: a required variable is missing (`DATABASE_URL`, `NEXTAUTH_SECRET`,
  `REFRESH_TOKEN_HASH_SECRET`, storage endpoint / credentials).
- **development**: storage must be local. Remote storage needs an explicit `STORAGE_PROVIDER=s3`
  (warned at start), so test submissions never land in the production bucket by accident.

The database driver follows the host (`*.neon.tech` -> Neon driver, anything else -> `pg`;
override with `DB_DRIVER`), so production against a self-hosted PostgreSQL works as well.

`GET /api/health` reports `environment`, database, cache and storage status.

## Object storage

`lib/storageConfig.mjs` resolves the target; `lib/s3.js` (app) and the scripts use it.

| Key prefix | Bucket | Content |
|---|---|---|
| `challenges/<language>/<challenge>/starter.js`, `harness.js` | `S3_BUCKET` (`public`) | challenge files, registered in `storage.assets` |
| `coding/submissions/...` | `S3_PRIVATE_BUCKET` (`private`) | code snapshots, referenced by `challenge.code_submissions.source_snapshot` |

Keys and bucket names are identical in both environments, so data copied between them stays
consistent with the database rows.

### Development storage (MinIO)

`compose.yml` (profile `dev`) runs MinIO (S3 API `127.0.0.1:9000`, console `127.0.0.1:9001`) on a
named volume, so data survives restarts. The official `minio/minio` images are no longer
published; the service uses Chainguard's source build, pinned by digest.

| Variable (`.env.local`) | Use |
|---|---|
| `STORAGE_PROVIDER=minio` | select MinIO (default in development when `MINIO_ENDPOINT` is set) |
| `MINIO_ENDPOINT` | `http://127.0.0.1:9000` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | server credentials, read by docker compose; also used by the app unless `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` are set |

```bash
npm run services:up            # start MinIO
npm run storage:init           # create the public / private buckets
npm run storage:sync           # copy every folder / file of the Neon buckets into MinIO
```

`storage:sync` creates missing buckets, is read-only on Neon, never deletes in MinIO, skips
unchanged objects (size + ETag) and refuses a non-local target. Re-run it to pick up new
production files. Options: `--init`, `--dry-run`, `--bucket public|private`,
`--prefix challenges/`, `--env <file>`.

## Redis cache

Redis is a cache only (PostgreSQL is the source of truth); every entry has a TTL and the app
falls back to an in-process LRU when Redis is down (`lib/cache.js`). Keys live in
`lib/cacheKeys.js`.

| Key | TTL | Data | Invalidation |
|---|---|---|---|
| `session:<id>` | <= session, max 5 min | session status | outbox on revoke (docs/auth.md) |
| `cache:course:list:<hash>` | 2 min (search 1 min) | guest catalog pages | TTL |
| `cache:course:filters` | 10 min | language / category options | TTL |
| `cache:course:<id>:details` | 5 min | guest course page | enrol / withdraw |
| `cache:roadmap:list` | 10 min | roadmap list | TTL |
| `cache:roadmap:<id>:details` | 10 min | guest roadmap page | TTL |
| `cache:lesson:<source>` | 1 h | lesson content (Sanity) | TTL |
| `challenge:file:<object key>` | 1 h | starter / harness files from storage | TTL |
| `cache:challenge:<id>:quiz-key\|coding` | 10 min | quiz answer key, coding tests (server-side only) | TTL |
| `cache:user:<id>:v<n>:*` | 1-5 min | me, overview, course / learning lists, progress, roadmap | `invalidateUserCache` bumps `user:<id>:v` on enrol, withdraw, lesson progress or visit, favourite, challenge submission, profile update |

Not cached on purpose: quiz attempts / cooldowns and coding attempt counts (rules enforced from
PostgreSQL), comments (written often, shown right after posting), and anything written in the
same request.

## Lists, filters and search

Course catalog, My learning and Roadmaps keep their search and filters in the URL
(`/course?q=react&level=beginner,advanced&rating=4&language=1`). `lib/listFilters.js` is the
contract shared by the pages, the API routes and the cache keys; its values mirror the database:

| Param | Lists | Database |
|---|---|---|
| `q` | all | `ILIKE` on title (+ instructor for courses), wildcards escaped |
| `level` | all | `level_enum` |
| `price` | course | `catalog.course.cost` (`free` = 0, `paid` > 0) |
| `rating` | course | `catalog.course.rating >= n` |
| `language`, `category` | course | `catalog.language.id`, `catalog.category.id` (options: `GET /api/course/filters`, only those with courses) |
| `status` | learning | `status_course_enum`; absent = enrolled + in progress, `all` = every status |

Results are cached per normalised query (search case-folded), see the Redis table above. The
browser keeps each query in React Query, so going back to an earlier search is instant.

## Production checklist

Set in the Vercel project (Production scope), with values distinct from development:
`APP_ENV=production`, `STORAGE_PROVIDER=s3`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `DATABASE_URL`, `REDIS_URL` /
`REDIS_TOKEN`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `REFRESH_TOKEN_HASH_SECRET`,
`REFRESH_TOKEN_RECOVERY_KEY`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `MAIL_FROM` (the Gmail
address), `MAIL_PASSWORD` (its App Password; see [auth.md](auth.md)). Never set `MINIO_*` there.
`.env.local` leaves `MAIL_PASSWORD` empty, so development mail goes to Mailpit, never to real
inboxes; `npm run mail:test -- --env <file>` checks either side.
