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

3. Load every written course. Lessons whose `lesson.sanity.json` is missing or older than the
   source are rebuilt first (offline: images come from the committed `assets.json`).

   ```bash
   npm run cms:sync
   ```

   One course: `node content/tools/payload-sync.mjs content/courses/<course>`. After a change to
   `content/tools/build-lesson.mjs`, add `--rebuild` to rebuild every lesson.
4. The admin is at http://127.0.0.1:3010/admin, and the app reads it while `npm run dev` runs.

Stop it with `npm run cms:down`. The data stays in the `codedev_cms-db-data` volume.

### Change the collections

The image runs with `NODE_ENV=production`, where Payload never changes the schema by itself.
After editing `cms/src/collections`, start only the database and create a migration from the host.
The migration runs when the server starts.

```bash
docker compose --env-file .env.local --profile cms up -d cms-db
cd cms && DATABASE_URI=postgres://payload:<CMS_DB_PASSWORD>@127.0.0.1:5434/payload PAYLOAD_SECRET=<PAYLOAD_SECRET> npx payload migrate:create <name>
```

Then rebuild with `npm run cms:up`.
