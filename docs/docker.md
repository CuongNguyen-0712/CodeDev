# Docker

Every container is defined in **`compose.yml`** (project `codedev`). The former
`docker-compose.yml` (app + redis) and `docker-compose.dev.yml` (MinIO) are merged into it; the
data volumes are kept under their old names, so nothing is lost.

## Services

| Service | Image | Profile | Ports (host) | Networks | Healthcheck |
|---|---|---|---|---|---|
| `redis` | `redis:7-alpine` | always | `127.0.0.1:6379` | backend | `redis-cli ping` |
| `minio` | Chainguard MinIO (pinned digest) | `dev` | `127.0.0.1:9000`, `127.0.0.1:9001` | backend | none (image has no shell) |
| `postgres` | `postgres:18-alpine` | `db` | `127.0.0.1:5433` | backend | `pg_isready` |
| `sandbox` | **`codedev_sandbox`** (`sandbox/vercel/Dockerfile`, target `docker`: Node 24, Python 3.14, gcc/g++ 15.2, JDK 21, Go 1.26, Rust 1.93) | `dev`, `app` | none | sandbox (internal) | `GET /health` |
| `sandbox-gateway` | `codedev_sandbox` (`node gateway.mjs`) | `dev`, `app` | `127.0.0.1:4100` | sandbox, gateway | `GET /health` (proxied) |
| `app` | **`codedev_app`** (`Dockerfile`) | `app` | `${APP_PORT:-3000}` | backend, gateway | `GET /api/health` |

- Services talk by service name (`redis:6379`, `sandbox:4100`), never `localhost`.
- Only loopback ports are published, except the app. Redis was previously published on all
  interfaces without a password.
- `sandbox` is on an `internal` network: no route to the internet, the host or cloud metadata.
  Docker cannot publish ports of an internal-only container, so `next dev` on the host reaches it
  through `sandbox-gateway`, a TCP forwarder that runs no user code.
- The app reaches the sandbox through `sandbox-gateway:4100` too and never joins the `sandbox`
  network: Docker networks are not one-way, so learner code there could otherwise call
  `http://app:3000` past any edge proxy.
- `container_name` is not set: names are `codedev-<service>-1`, so several projects can coexist.
- `depends_on` uses `condition: service_healthy`; the app still retries Redis / storage itself.

## Volumes

| Volume | Data |
|---|---|
| `codedev_redis-data` | Redis (same volume as before) |
| `codedev-dev_minio-data` | MinIO buckets (same volume as before) |
| `codedev_postgres-data` | optional local PostgreSQL |

Never run `docker compose down -v` unless you mean to delete that data.

## Development

```bash
npm run services:up      # redis + minio + sandbox + gateway  (docker compose --env-file .env.local --profile dev up -d --build)
npm run dev              # Next.js on the host
npm run services:down
```

`.env.local` provides `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` and `CODE_RUNNER_TOKEN`. Add
`CODE_RUNNER_URL=http://127.0.0.1:4100` (and the same token) to `.env.local` to grade coding
submissions on the server ([sandbox.md](sandbox.md)). PostgreSQL normally runs natively on 5432;
`docker compose --env-file .env.local --profile db up -d postgres` starts a container on 5433.

## Production container

```bash
npm run docker:app       # docker compose --env-file .env.production --profile app up -d --build
```

- Image build (`Dockerfile`): `deps` (`npm ci` from the lockfile) -> `builder` (`next build`,
  `output: "standalone"`) -> `runner` (Node 24 alpine, standalone server + static files only,
  non-root user `nextjs`). No dev dependencies and no `.env*` files reach the image
  (`.dockerignore`).
- `NEXT_PUBLIC_*` values are inlined into the client bundle, so they are passed as build args from
  the env file used for interpolation. Everything else comes from `env_file` at run time
  (`CODEDEV_ENV_FILE`, default `.env.production`, plus `.env`).
- The app uses the compose `redis` (overrides an Upstash URL/token) and `sandbox` services.
- `init: true` puts an init process at PID 1 so SIGTERM reaches Node; `stop_grace_period` gives
  in-flight requests time to finish. Startup never runs migrations.
- The production deployment of the site is Vercel; this container is for self-hosting or a
  production-like local run. There is no CI pipeline in the repository.
