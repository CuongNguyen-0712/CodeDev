# Lesson bodies: Payload locally, Sanity in production

Lesson bodies (the narrative, code blocks, challenge embeds) come from one store per environment.
Answers, test cases and starter files live in Postgres and object storage in every environment.

| Environment | Store | Written by |
|---|---|---|
| Local development | Local Payload CMS (`cms/`, Docker) | `content/tools/payload-sync.mjs`, `build-course.mjs --payload` |
| Production, staging | Sanity | `content/tools/push-lesson.mjs`, `build-course.mjs --push` |

- **Which store is read:** `lessonSource()` in `lib/lessonContent.js`. Production and staging
  (`APP_ENV`, see `lib/appEnv.mjs`) read Sanity. Everything else reads Payload. Set
  `LESSON_CONTENT_SOURCE=sanity` or `payload` to override, for example to check Sanity from a laptop.
  After switching, delete the cached bodies: `redis-cli --scan --pattern 'cache:lesson:*' | xargs redis-cli del`.
- **No silent fallback:** a lesson missing from the store is a 404. When the local store is not
  configured or not running, the lesson API answers 503 with the command to run.
- **Writes are guarded:** `push-lesson.mjs` refuses an env file whose `APP_ENV` is not production
  or staging (`--force` overrides). `push-lesson-payload.mjs` refuses a `PAYLOAD_URL` that is not
  on this machine. Local work never reaches the shared Sanity dataset.

## The local store

- **What it stores:** collection `lessons`, one document per lesson. `sourceId` is the lesson id
  (`course.lesson.content_source`, the same `_id` Sanity uses). `content` is the Portable Text
  array from `lesson.sanity.json`, stored as JSON, so the app renders it with the same
  `PortableTextRenderer`.
- **Access:** every read and write needs a signed-in user or an API key. The first start creates
  one admin user (`CMS_ADMIN_EMAIL`, `CMS_ADMIN_PASSWORD`) with the API key `CMS_API_KEY`.

### Run it

1. Set the `PAYLOAD_SECRET`, `CMS_*` and `PAYLOAD_*` variables in `.env.local` (see `.env.example`).
   `PAYLOAD_API_KEY` is the same value as `CMS_API_KEY`.
2. Start the CMS and its own PostgreSQL. Both are bound to loopback only.

   ```bash
   npm run cms:up
   ```

3. Load every written course. Lessons whose `lesson.payload.json` is missing or older than the
   source are rebuilt first. Media is uploaded to the CMS first (see Media below), so the CMS must be running.

   ```bash
   npm run cms:sync
   ```

   One course: `node content/tools/payload-sync.mjs content/courses/<course>`. After a change to
   `content/tools/build-lesson.mjs`, add `--rebuild` to rebuild every lesson.
4. The admin is at http://127.0.0.1:3010/admin, and the app reads it while `npm run dev` runs.

Stop it with `npm run cms:down`. The data stays in the `codedev_cms-db-data` volume.

## Media

Outside production every uploaded file lives in the local CMS; Cloudinary is production only.

- **Collection `media`** (`cms/src/collections/Media.ts`): upload collection with `key` (unique),
  `purpose` (`content` or `avatar`) and `alt`. Reads are public; writes need the API key. Avatars
  accept only jpeg, png, gif and webp and are resized to fit 512 px on create and update.
- **Storage:** MinIO bucket `S3_MEDIA_BUCKET` (default `media`) through `@payloadcms/storage-s3`.
  `npm run storage:init` creates it. Files are served at `<PAYLOAD_URL>/api/media/file/<filename>`;
  Payload may rename a file, so always use the URL it returns.
- **Avatars:** `lib/media/mediaStore.js` sends them to Payload outside production and to Cloudinary
  (`<root>/users/<id>/avatars/...`) in production. `storage.assets.provider` can be `payload`.
- **Course and lesson media:** `node content/tools/upload-media.mjs <course|lesson> [--env file] [--dry-run]`.
  The target follows `APP_ENV` of the env file. A shell `APP_ENV` that differs from the env file is
  refused, except `APP_ENV=development` (forces the local target; `payload-sync.mjs` uses it).
  Videos over 20 MB go to Cloudinary in chunks.

  | `APP_ENV` | Target | Manifests (course / lesson) |
  |---|---|---|
  | production | Cloudinary `codedev/courses/...` | `course.json` (`image`, `imageChecksum`), `assets.json`, both committed |
  | anything else | local Payload | `course.local.json`, `assets.local.json`, both git-ignored |

  `build-lesson.mjs --target payload` reads `assets.local.json` and writes `lesson.payload.json`;
  the default `--target sanity` is unchanged. `npm run cms:sync` runs the upload for every course,
  then builds and pushes the lessons. `apply-seed.mjs` against a local database sets course covers
  from `course.local.json`.
- **Videos:** put `*.mp4` / `*.webm` (max 200 MB) in `<lesson>/videos/`. They are stored with Git LFS:
  run `git lfs install` once per machine.
- **Renderer allowlist:** `lib/media/mediaOrigins.mjs`. `next.config.js` exposes it as
  `NEXT_PUBLIC_MEDIA_ORIGINS` (Cloudinary always, the Payload origin only outside production).
  Restart the dev server after changing `PAYLOAD_URL`.
- **Deletes:** `destroyStoredFile` never deletes a Cloudinary file outside production (it warns and
  returns `skipped`, which the account purge counts as done) and never calls Payload from production.

### Cloudinary cleanup

`node scripts/cloudinary-cleanup.mjs --scope dev|orphans --env .env.production [--apply]`, dry run
unless `--apply` (then the cloud name must be typed). The report goes to the OS temp dir.

- `--scope dev`: everything under `codedev/development/`, `codedev/test/` and `codedev/staging/`.
- `--scope orphans`: `codedev/**` not referenced by a committed `assets.json`, a course cover, a
  live `storage.assets` row, a `catalog.course` cover or a Sanity lesson. The env file must set
  `APP_ENV=production`, the production `DATABASE_URL`, and `NEXT_PUBLIC_SANITY_PROJECT_ID`,
  `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION` and `SANITY_READ_TOKEN`: without the
  token, draft-only lesson images are invisible and would be deleted. Assets created less than an
  hour before the references were read are kept and listed with reason `too-new`.

### Production cutover

1. `CLOUDINARY_*` currently live in `.env` (shared). Move them to `.env.production` and the Vercel
   Production scope, then remove them from `.env`.
2. `.env.production` needs `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`,
   `NEXT_PUBLIC_SANITY_API_VERSION` and `SANITY_READ_TOKEN` for `--scope orphans`.
3. Folder layout on the production account (dynamic folders): `codedev/courses/<course>/...` for
   covers, diagrams and videos, `codedev/users/<id>/avatars/...` for avatars. Content already uses
   these public ids (the committed `assets.json` / `course.json`), so nothing is re-uploaded.
   Avatars uploaded before 2026-11-09 sit in `codedev/users/...` as asset folder but keep their
   `codedev/production/users/...` public ids; `storage.assets` and profile URLs point at those, so
   they stay valid and the orphan scope keeps them.
4. Order:
   1. `node scripts/cloudinary-cleanup.mjs --scope dev --env .env.production` (dry run; expect 0).
   2. `node scripts/cloudinary-cleanup.mjs --scope orphans --env .env.production` (dry run).
   3. Read both reports, then run each again with `--apply` only if a report lists files you want gone.
5. Later media changes: `node content/tools/upload-media.mjs <course or lesson folder> --env .env.production`,
   commit `assets.json` / `course.json`, then `build-course.mjs <course> --skip-uploads --push` and apply
   the seed. The first production run per course re-uploads its cover once (no `imageChecksum` yet),
   to the same public id.

### Change the collections

The image runs with `NODE_ENV=production`, where Payload never changes the schema by itself.
After editing `cms/src/collections`, start only the database and create a migration from the host.
The migration runs when the server starts.

```bash
docker compose --env-file .env.local --profile cms up -d cms-db
cd cms && DATABASE_URI=postgres://payload:<CMS_DB_PASSWORD>@127.0.0.1:5434/payload PAYLOAD_SECRET=<PAYLOAD_SECRET> npx payload migrate:create <name>
```

Then rebuild with `npm run cms:up`.
