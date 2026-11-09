# Media storage: Payload locally, Cloudinary for production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every local image/video upload (lesson diagrams, covers, videos, avatars) goes to the local Payload CMS (files in MinIO); Cloudinary serves production only, under `codedev/production/`, and the Cloudinary account is cleaned up.

**Architecture:** One provider-neutral store layer (`lib/media/`) picks Cloudinary in production and Payload elsewhere, for the app (avatars) and the content tools (`upload-media.mjs`). Content keeps two manifests: committed `assets.json` (production URLs) and gitignored `assets.local.json` (Payload URLs); `build-lesson.mjs --target payload` builds the local lesson document from the local manifest. Cleanup is a dry-run-first script whose orphan logic is a pure function.

**Tech Stack:** Next.js 16 app (JS, Vitest), Payload 3.91 (`cms/`, TypeScript, `@payloadcms/db-postgres`, new `@payloadcms/storage-s3`, `sharp`), MinIO (compose `dev` profile), `cloudinary` v2 SDK, PostgreSQL migrations in `db/migrations`.

**Spec:** `docs/superpowers/specs/2026-11-09-media-payload-cloudinary-design.md`

> **Revision 2026-11-09 (after execution):** the Cloudinary account is production only with dynamic folders `codedev/courses/...` and `codedev/users/...`. Every `codedev/production/` path below is now `codedev/` (`cloudinaryFolder` -> `<root>/<parts>`, `cloudinaryPublicId(key)` -> `codedev/<key>`), and Task 10 no longer re-uploads content; see the "Production cutover" section of `docs/payload-cms.md`.

## Global Constraints

- Production (`APP_ENV=production`) uses Cloudinary only; every other `APP_ENV` uses Payload only. No fallback between them.
- Cloudinary public ids: `codedev/production/courses/<course>/<lesson>/<name>`, cover `codedev/production/courses/<course>/cover`, avatars `<CLOUDINARY_ROOT_FOLDER>/production/users/<id>/avatars/<ulid>`.
- Payload `media.key`: `courses/<course>/<lesson>/<name>`, `courses/<course>/cover`, `users/<userId>/avatars/<ulid>`.
- Payload auth header: `Authorization: users API-Key <PAYLOAD_API_KEY>` (same as `push-lesson-payload.mjs`).
- Local target refuses a `PAYLOAD_URL` that is not local (`isLocalUrl` from `lib/appEnv.mjs`); production target requires `APP_ENV=production` in the env file.
- MinIO bucket for Payload: `S3_MEDIA_BUCKET`, default `media`.
- Video: `video/mp4`, `video/webm`, max 200 MB; Cloudinary `upload_large` above 20 MB.
- Images: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`.
- Avatar: max 5 MB in, stored fit inside 512x512, no enlargement.
- Manifest entry: `{ key, url, width, height, format, bytes, checksum, provider }` + `publicId` (Cloudinary) + `duration` (video), under `images.<name>` / `videos.<name>`; covers under `cover`.
- Missing manifest key at build: throw `image "<name>" is not in <manifest> - run upload-media.mjs` (`video "<name>"` for videos).
- Cleanup script never deletes without `--apply` and the cloud name typed back; refuses if any reference source is unreadable.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Payload down while a developer uploads an avatar → 503 with `npm run cms:up` in the log, no `storage.assets` row, no crash (Task 3 test `returns 503 when the store is not configured`).
2. `upload-media.mjs` with an env file whose `APP_ENV` is not production but has no `PAYLOAD_URL`, or a remote `PAYLOAD_URL` in `.env.local` → refuses before any upload, never falls back to Cloudinary (Task 4 tests in `mediaTarget.test.js`).
3. Re-running `cms:sync` after a fresh MinIO volume: manifest checksum matches but the Payload document is gone → must re-upload, not skip (Task 4 test `re-uploads when the remote document is missing`).
4. Lesson built for Payload but the local manifest lacks a diagram that exists in `assets.json` → throws, never silently uses the Cloudinary URL (Task 5 test `payload target never reads assets.json`).
5. Cleanup run when the production DB query fails (bad `.env.production`) → refuses, deletes nothing (Task 9 test `refuses without every reference source`).

---

## File Structure

| File | Responsibility |
|---|---|
| `cms/src/collections/Media.ts` (new) | Payload upload collection `media`, avatar resize hook |
| `cms/src/payload.config.ts` | register `Media`, `s3Storage` plugin |
| `cms/src/migrations/<ts>_media.ts` (generated) | schema for `media` |
| `lib/media/payloadMedia.mjs` (new) | fetch helpers for Payload `media` (app + tools) |
| `lib/media/mediaStore.js` (new) | `mediaStore()`, `cloudinaryStore`, `payloadStore`, `destroyStoredFile()` |
| `lib/media/mediaOrigins.mjs` (new) | `mediaOrigins(env)`, `isAllowedMediaUrl(url, origins)` |
| `lib/media/cloudinaryOrphans.mjs` (new) | pure orphan computation |
| `content/tools/mediaTarget.mjs` (new) | target resolution, guards, manifest paths, checksum skip |
| `content/tools/upload-media.mjs` (new) | uploads course cover + lesson diagrams/videos |
| `scripts/cloudinary-cleanup.mjs` (new) | dry-run / apply cleanup |
| `db/migrations/20261109_020_assets_payload_provider.sql` (new) | provider check allows `payload` |
| Modified | `services/media.service.js`, `db/media.db.js`, `services/authOutbox.service.js`, `lib/cloudinary.js`, `lib/envCheck.mjs`, `components/ui/portableTextRenderer.jsx`, `next.config.js`, `content/tools/build-lesson.mjs`, `build-course.mjs`, `payload-sync.mjs`, `push-lesson-payload.mjs`, `apply-seed.mjs`, `scripts/storage-sync.mjs`, `compose.yml`, `.env.example`, `.gitignore`, `.gitattributes`, `db/schema.sql`, docs |
| Deleted | `content/tools/upload-images.mjs`, `content/tools/upload-cover.mjs` |

---

### Task 1: Payload `media` collection on MinIO

**Files:**
- Create: `cms/src/collections/Media.ts`
- Modify: `cms/src/payload.config.ts`, `cms/package.json`, `compose.yml` (service `cms`), `scripts/storage-sync.mjs` (`--init` creates `media` bucket), `.env.example`
- Generated: `cms/src/migrations/<timestamp>_media.ts` + `cms/src/migrations/index.ts`

**Interfaces:**
- Produces: REST `POST /api/media` (multipart: `file`, `_payload` JSON `{ key, purpose, alt? }`) → `{ doc: { id, key, url, filename, mimeType, filesize, width, height } }`; `GET /api/media?where[key][equals]=<key>&limit=1`; `DELETE /api/media/<id>`; file at `<PAYLOAD_URL>/api/media/file/<filename>` (public read).

- [ ] **Step 1: Add dependencies** — `npm --prefix cms install @payloadcms/storage-s3@3.91.0 sharp` (pin `sharp` exact). Expected: both in `cms/package.json` `dependencies`.
- [ ] **Step 2: Write `Media.ts`** — `slug: 'media'`; `upload: { mimeTypes: [<7 types from Global Constraints>] }`; fields `key` (text, required, unique, index), `purpose` (select `content`|`avatar`, required), `alt` (text); access `read: () => true`, `create/update/delete: signedIn` (same helper as `Lessons.ts`); `hooks.beforeOperation`: on `operation === 'create'`, when the incoming data has `purpose === 'avatar'` and `req.file` is set, replace `req.file.data` with `await sharp(req.file.data).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).toBuffer()` and update `req.file.size`. File size limit lives in `payload.config.ts` (Step 3).
- [ ] **Step 3: Register in `payload.config.ts`** — `collections: [Users, Lessons, Media]`, `sharp`, `upload: { limits: { fileSize: 200 * 1024 * 1024 } }`, `plugins: [s3Storage({ collections: { media: true }, bucket: process.env.S3_MEDIA_BUCKET || 'media', config: { endpoint: process.env.MINIO_ENDPOINT, region: process.env.MINIO_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER, secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD } } })]`.
- [ ] **Step 4: Compose + bucket** — `cms.environment` adds `MINIO_ENDPOINT: http://minio:9000`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_MEDIA_BUCKET: ${S3_MEDIA_BUCKET:-media}` (cms already on `backend` with minio). `storage-sync.mjs --init` creates `S3_MEDIA_BUCKET` too (MinIO only; never on the remote source). `.env.example`: `S3_MEDIA_BUCKET=media` in the object-storage block.
- [ ] **Step 5: Migration** — per `docs/payload-cms.md` "Change the collections": start `cms-db`, run `npx payload migrate:create media` in `cms/`. Expected: new file in `cms/src/migrations`, `index.ts` lists it.
- [ ] **Step 6: Verify** — `npm run storage:init && npm run cms:up`, then:
  ```bash
  curl -s -H "Authorization: users API-Key $PAYLOAD_API_KEY" -F file=@public/image/static/logo.png -F '_payload={"key":"smoke/logo","purpose":"content"}' http://127.0.0.1:3010/api/media
  ```
  Expected: JSON `doc.url` ending `/api/media/file/logo.png`; `curl -I` on that URL without auth → `200`, `content-type: image/png`. Repeat with `"purpose":"avatar"` and a >512px PNG → `doc.width <= 512`. Delete both with `DELETE /api/media/<id>`.
- [ ] **Step 7: Commit** — `feat(cms): media upload collection stored in MinIO, avatar resize to 512`.

---

### Task 2: Store layer `lib/media/`

**Files:**
- Create: `lib/media/payloadMedia.mjs`, `lib/media/mediaStore.js`
- Modify: `lib/cloudinary.js` (folder always `production`)
- Test: `__tests__/media/mediaStore.test.js`

**Interfaces:**
- Consumes: Task 1 REST shape.
- Produces:
  - `payloadMedia.mjs`: `payloadConfig(env = process.env) → { baseUrl, apiKey } | null`; `uploadToPayload({ baseUrl, apiKey, buffer, filename, mime, key, purpose, alt? }) → Promise<{ id, url, width, height, mimeType, filesize }>` (throws `Error` with status on non-2xx; replaces an existing doc with the same `key` by deleting it first); `findByKey({ baseUrl, apiKey, key }) → Promise<doc | null>`; `deleteFromPayload({ baseUrl, apiKey, id }) → Promise<"ok" | "not found">`.
  - `mediaStore.js`: `mediaStore(env = process.env) → store`; `store = { provider: "cloudinary" | "payload", isConfigured(): boolean, upload(buffer, { key, mime, filename, maxSide, purpose }): Promise<{ provider, objectKey, url, width, height, format, version, bytes }>, destroy(objectKey): Promise<"ok" | "not found"> }`; `destroyStoredFile({ provider, objectKey, bucket? }) → Promise<void>` dispatching `cloudinary` → `destroyAsset`, `payload` → `deleteFromPayload`, else `s3.delete`.
  - Payload `objectKey` = Payload document id (string). Cloudinary `objectKey` = public id.
  - `lib/cloudinary.js`: `cloudinaryFolder(...parts)` → `<root>/production/<parts>`.

- [ ] **Step 1: Write failing tests** in `__tests__/media/mediaStore.test.js`:
  - `picks Cloudinary only in production`: `mediaStore({ APP_ENV: "production" }).provider === "cloudinary"`; `"development"`, `"test"`, `"staging"` → `"payload"`.
  - `payload store is not configured without PAYLOAD_URL or key`: `mediaStore({ APP_ENV: "development" }).isConfigured() === false`.
  - `uploads to Payload and maps the response` (stub `global.fetch`): asserts POST to `http://127.0.0.1:3010/api/media`, header `users API-Key k`, form `_payload` contains `"key":"users/u1/avatars/x"`; result `{ provider: "payload", objectKey: "42", url: "http://127.0.0.1:3010/api/media/file/x.png", width: 64, height: 64, format: "png", bytes: 70 }`.
  - `treats a 404 on delete as not found`: `deleteFromPayload` with fetch 404 → `"not found"`; 500 → rejects.
  - `destroyStoredFile dispatches by provider`: mock `@/lib/cloudinary` and `@/lib/s3`; `cloudinary` calls `destroyAsset("a")`, `payload` calls fetch DELETE `/api/media/7`, `s3` calls `s3.delete("coding/x", { bucket: "private" })`.
  - `cloudinaryFolder always uses the production segment`: with `APP_ENV=development`, `cloudinaryFolder("users","u1")` → `codedev/production/users/u1`.
- [ ] **Step 2: Run** `npx vitest run __tests__/media/mediaStore.test.js` — Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** `payloadMedia.mjs` (uses global `fetch`, `FormData`, `Blob`; `payloadConfig` returns null unless both vars set), `mediaStore.js` (`cloudinaryStore.upload` wraps `uploadBuffer` with `folder` = `cloudinaryFolder` of the key's dirname, `public_id` = basename, `transformation` limit `maxSide` when given; `format` from Payload = extension of `mimeType`), and the `lib/cloudinary.js` folder change (comment: production only; dev never uploads).
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(media): provider-neutral media store, Cloudinary for production and Payload elsewhere`.

---

### Task 3: Avatars through `mediaStore`, provider `payload`, purge dispatch, env checks

**Files:**
- Create: `db/migrations/20261109_020_assets_payload_provider.sql`
- Modify: `db/schema.sql` (`chk_assets_provider`), `db/media.db.js:71-93`, `services/media.service.js`, `services/authOutbox.service.js:51-58`, `lib/envCheck.mjs:38-40`, `.env.example` (move `CLOUDINARY_*` under a "production only" comment)
- Test: `__tests__/media/avatarUpload.test.js`, new `__tests__/media/mediaEnv.test.js` (env check cases)

**Interfaces:**
- Consumes: `mediaStore()`, `destroyStoredFile()` (Task 2).
- Produces: `mediaDb.setAvatar({ userId, asset })` where `asset.provider` is now required and written to `storage.assets.provider`.

- [ ] **Step 1: Migration** — `ALTER TABLE storage.assets DROP CONSTRAINT chk_assets_provider, ADD CONSTRAINT chk_assets_provider CHECK (provider IN ('s3','cloudinary','payload'));` mirrored in `db/schema.sql`. Run `npm run db:migrate`. Expected: applied, no error.
- [ ] **Step 2: Update tests** in `avatarUpload.test.js`: replace the `@/lib/cloudinary` mock with a mock of `@/lib/media/mediaStore` whose `mediaStore()` returns a fake store (`provider: "payload"`, `upload` records `{ key, maxSide }`, `destroy` records ids) and whose `destroyStoredFile` records `{ provider, objectKey }`. Change assertions: key matches `/^users\/[^/]+\/avatars\/[0-9a-z]{26}$/`, `maxSide === 512`, stored row `provider === "payload"`. Add `returns 503 when the store is not configured` (fake `isConfigured: () => false` → `ApiError` status 503, no new `storage.assets` row). Add env tests: `checkEnvironment({ APP_ENV: "production", PAYLOAD_URL: "x", ... })` has an error containing `PAYLOAD_URL`; production without `CLOUDINARY_*` → error (not warning); development with `CLOUDINARY_*` set → warning containing `ignored outside production`; development without `PAYLOAD_URL` → warning containing `uploads are disabled`.
- [ ] **Step 3: Run** `npx vitest run __tests__/media __tests__/storage` — Expected: new/changed cases FAIL.
- [ ] **Step 4: Implement** — `media.service.js`: `const store = mediaStore()`; not configured → `ApiError("Image uploads are not available right now", 503, { expose: true })` and, outside production, `console.warn("[media] start the local CMS: npm run cms:up")`; upload with `key = users/<userId>/avatars/<ulid>`, `maxSide: 512`; `asset.provider = uploaded.provider`, `asset.objectKey = uploaded.objectKey`; rollback and `destroyFile` use `destroyStoredFile`. `media.db.js`: insert `$provider` instead of literal. `authOutbox.service.js` `storage.purge`: `for (const file of payload.files || []) await destroyStoredFile({ provider: file.provider, objectKey: file.key, bucket: file.bucket })`. `envCheck.mjs`: rules from Step 2.
- [ ] **Step 5: Run** `npx vitest run` — Expected: all pass (DB tests skip without `DATABASE_URL`; run them with it).
- [ ] **Step 6: Manual check** — `npm run dev` with CMS up, upload/restore/delete an avatar on Settings in the in-app browser; avatar URL starts with `http://127.0.0.1:3010/api/media/file/`.
- [ ] **Step 7: Commit** — `feat(media): avatars use the local Payload CMS outside production; storage.assets provider 'payload'`.

---

### Task 4: `upload-media.mjs` (covers, diagrams, videos)

**Files:**
- Create: `content/tools/mediaTarget.mjs`, `content/tools/upload-media.mjs`, `.gitattributes`
- Modify: `.gitignore` (`/content/courses/**/assets.local.json`, `/content/courses/*/course.local.json`, `/content/courses/*/*/lesson.payload.json`), `content/tools/build-course.mjs` (step `upload-images` → `upload-media`; `--skip-uploads` text: no Cloudinary / Payload / S3 calls)
- Delete: `content/tools/upload-images.mjs`, `content/tools/upload-cover.mjs`
- Test: `__tests__/content/mediaTarget.test.js`

**Interfaces:**
- Consumes: `uploadToPayload`, `findByKey`, `payloadConfig` (Task 2); `isLocalUrl`, `appEnv` (`lib/appEnv.mjs`).
- Produces (`mediaTarget.mjs`):
  - `resolveMediaTarget(env) → { provider: "cloudinary" | "payload", manifestName: "assets.json" | "assets.local.json", courseManifestName: "course.json" | "course.local.json" }`; throws `Error` when production lacks `CLOUDINARY_*`, when non-production lacks `PAYLOAD_URL`/`PAYLOAD_API_KEY`, or when `PAYLOAD_URL` is not local.
  - `needsUpload(entry, checksum, { remoteExists }) → boolean` — true when no entry, checksum differs, or `remoteExists === false`.
  - `mediaKey({ course, lesson?, name }) → string` and `cloudinaryPublicId(key) → "codedev/production/" + key`.
- `upload-media.mjs <course|lesson folder> [--env <file>] [--dry-run]`: a course folder means cover + every lesson in `course.json`; a lesson folder means its `diagrams/` and `videos/`. Writes the manifest for the target. Local covers go to `course.local.json` as `{ "image": <url> }`; production covers update `course.json` `image` (and `update.image` for an `existing` course, as `upload-cover.mjs` did).

- [ ] **Step 1: Write failing tests** (`mediaTarget.test.js`):
  - `production env targets Cloudinary and assets.json`.
  - `development targets Payload and assets.local.json`.
  - `refuses a remote PAYLOAD_URL` (`https://cms.example.com`) → throws `/local CMS/`.
  - `refuses a non-production env without PAYLOAD_URL` (env has `CLOUDINARY_*` set) → throws `/PAYLOAD_URL/`, never returns `cloudinary`.
  - `skips unchanged files` → `needsUpload({ checksum: "a" }, "a", { remoteExists: true }) === false`.
  - `re-uploads when the remote document is missing` → `needsUpload({ checksum: "a" }, "a", { remoteExists: false }) === true`.
  - `keys and public ids` → `mediaKey({ course: "c", lesson: "l", name: "d" }) === "courses/c/l/d"`, `cloudinaryPublicId("courses/c/cover") === "codedev/production/courses/c/cover"`.
- [ ] **Step 2: Run** `npx vitest run __tests__/content/mediaTarget.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `mediaTarget.mjs`, then `upload-media.mjs` reusing the env loading and `sharp` cover render from the deleted `upload-cover.mjs`. Cloudinary: `uploader.upload` (`overwrite: true`, `invalidate: true`), `upload_large` with `chunk_size: 20 * 1024 * 1024` for videos > 20 MB; delivery URL via `cloudinary.url(publicId, { secure: true, transformation: [{ crop: "limit", width: 1600 }, { quality: "auto" }], version })` for images (same as today), plain `secure_url` for videos. Payload: `remoteExists` via `findByKey`; upload with `purpose: "content"`. Reject files > 200 MB before upload. `.gitattributes`: `*.mp4 filter=lfs diff=lfs merge=lfs -text` and `*.webm` same; run `git lfs install --local` once (document in Task 10 docs).
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Manual check** — `node content/tools/upload-media.mjs content/courses/nodejs-high-performance/01-race-condition-distributed-lock` with CMS up. Expected: `assets.local.json` with 3 images, URLs on `127.0.0.1:3010`; second run prints `unchanged` for all 3; `git status` shows no change to `assets.json`.
- [ ] **Step 6: Commit** — `feat(content): upload-media.mjs sends covers, diagrams and videos to Payload locally or Cloudinary in production`.

---

### Task 5: Build lessons for Payload from the local manifest

**Files:**
- Modify: `content/tools/build-lesson.mjs`, `content/tools/payload-sync.mjs`, `content/tools/push-lesson-payload.mjs`, `content/tools/build-course.mjs` (`--payload` builds with `--target payload`)
- Test: `__tests__/content/buildLessonTarget.test.js`

**Interfaces:**
- Consumes: manifests from Task 4.
- Produces: `build-lesson.mjs <lesson> [--target sanity|payload]` — `sanity` (default) reads `assets.json`, writes `lesson.sanity.json`; `payload` reads only `assets.local.json`, writes `lesson.payload.json`. New source helper `video(name, { title })` → `{ _type: "video", _key, url, title, width, height, mime }` from `videos.<name>`. `push-lesson-payload.mjs` and `payload-sync.mjs` read `lesson.payload.json`; `payload-sync.mjs` runs `upload-media.mjs` per course (local target) before building.

- [ ] **Step 1: Write failing tests** (run the script with `execFileSync` on a temp lesson folder holding `lesson.source.mjs` with one `image("d")` and one `video("v")`, `challenges.json` `{ "challenges": [] }`):
  - `payload target uses assets.local.json` → `lesson.payload.json` image `url` is the local URL; `lesson.sanity.json` not written.
  - `payload target never reads assets.json` → with `d` only in `assets.json`, exit code ≠ 0 and stderr contains `image "d" is not in assets.local.json - run upload-media.mjs`.
  - `video blocks carry the manifest file` → `{ _type: "video", url: <manifest url>, mime: "video/mp4" }`.
  - `default target is unchanged` → `lesson.sanity.json` uses `assets.json` URL.
- [ ] **Step 2: Run** `npx vitest run __tests__/content/buildLessonTarget.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the `--target` flag, manifest selection, `video` helper, and the file renames in the two Payload tools; `payload-sync.mjs` rebuild check uses `lesson.payload.json` and `assets.local.json` mtimes.
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(content): build lessons for Payload from assets.local.json; video blocks from uploaded files`.

---

### Task 6: Renderer and Next image allowlist

**Files:**
- Create: `lib/media/mediaOrigins.mjs`
- Modify: `components/ui/portableTextRenderer.jsx:107-130` (rename `CloudinaryImage` → `MediaImage`, keep block type `cloudinaryImage`), `VideoEmbed` (direct files checked), `next.config.js` (`env.NEXT_PUBLIC_MEDIA_ORIGINS`, Payload remote pattern outside production)
- Test: `__tests__/ui/mediaOrigins.test.js`

**Interfaces:**
- Produces: `mediaOrigins(env) → string[]` — `["https://res.cloudinary.com"]`, plus `new URL(env.PAYLOAD_URL).origin` when `appEnv(env) !== "production"`; `isAllowedMediaUrl(url, origins) → boolean` (exact origin match via `new URL`, false on parse error). `next.config.js` sets `env: { NEXT_PUBLIC_MEDIA_ORIGINS: mediaOrigins(process.env).join(",") }`; the renderer splits it.

- [ ] **Step 1: Write failing tests**: `production allows Cloudinary only` (with `PAYLOAD_URL` set, result length 1); `development adds the Payload origin`; `rejects a foreign host` (`https://evil.example/x.png` → false); `rejects a look-alike prefix` (`https://res.cloudinary.com.evil.io/x` → false); `accepts a Payload file URL in development`.
- [ ] **Step 2: Run** `npx vitest run __tests__/ui/mediaOrigins.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** module, renderer change (`MediaImage` returns null when not allowed; `VideoEmbed` direct `<video>` only when allowed, YouTube/Vimeo unchanged), `next.config.js` env + conditional remote pattern `{ protocol: 'http', hostname: '127.0.0.1', port: '3010', pathname: '/api/media/file/**' }` derived from `PAYLOAD_URL`.
- [ ] **Step 4: Run** tests and `npx vitest run __tests__/ui` — Expected: PASS.
- [ ] **Step 5: Manual check** — `npm run cms:sync && npm run dev`; open `nodejs-high-performance` lesson 1 in the in-app browser; the 3 diagrams load from `127.0.0.1:3010` (network panel), no request to `res.cloudinary.com`.
- [ ] **Step 6: Commit** — `feat(lessons): render media from an origin allowlist; local Payload files outside production`.

---

### Task 7: Local seed uses local covers

**Files:**
- Modify: `content/tools/apply-seed.mjs`
- Create: `content/tools/localCovers.mjs`
- Test: `__tests__/content/localCovers.test.js`

**Interfaces:**
- Produces: `localCoverUpdates(courseDirs) → { updates: { publicId, image }[], missing: string[] }` reading `course.json` (`publicId`) and `course.local.json` (`image`). `apply-seed.mjs`: when the target database is local (`isLocalUrl` on the connection host), after each seed runs `UPDATE catalog.course SET image = $2 WHERE public_id = $1` for the seed's course; a course with no `course.local.json` aborts with `no local cover for <course> - run npm run cms:sync`. Remote targets unchanged.

- [ ] **Step 1: Write failing tests**: `maps publicId to the local cover URL`; `lists courses without course.local.json as missing`.
- [ ] **Step 2: Run** `npx vitest run __tests__/content/localCovers.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** helper and the `apply-seed.mjs` hook (seed file `db/seeds/<course>.sql` → course folder `content/courses/<course>`).
- [ ] **Step 4: Run** tests — Expected: PASS. Manual: `node content/tools/apply-seed.mjs db/seeds/nodejs-high-performance.sql`; `catalog.course.image` for that course starts with `http://127.0.0.1:3010/`.
- [ ] **Step 5: Commit** — `feat(content): local seeds point course covers at the local CMS`.

---

### Task 8: `cms:sync` end to end + docs

**Files:**
- Modify: `package.json` (`cms:sync` unchanged command; `payload-sync.mjs` already uploads media from Task 5), `docs/payload-cms.md`, `docs/environments.md`, `README.md` (env table: `CLOUDINARY_*` production only, `S3_MEDIA_BUCKET`, Git LFS for videos), `content/tools/build-course.mjs` header comment

- [ ] **Step 1: Docs** — `payload-cms.md`: new "Media" section (collection `media`, MinIO bucket, `upload-media.mjs`, manifests, `git lfs install`); remove "images come from the committed assets.json". `environments.md`: Cloudinary row = production only.
- [ ] **Step 2: Verify from scratch** — `npm run services:down && npm run storage:init && npm run cms:up && npm run cms:sync && npm run dev` with `CLOUDINARY_*` removed from `.env.local`. Expected: start-up check prints no Cloudinary error; a lesson with diagrams, a course card cover and an avatar upload all work; `npx vitest run` passes.
- [ ] **Step 3: Commit** — `docs: media in the local Payload CMS, Cloudinary for production only`.

---

### Task 9: Cloudinary cleanup script

**Files:**
- Create: `lib/media/cloudinaryOrphans.mjs`, `scripts/cloudinary-cleanup.mjs`
- Test: `__tests__/media/cloudinaryOrphans.test.js`

**Interfaces:**
- Produces:
  - `findOrphans({ assets, referenced }) → { keep: Asset[], orphans: Asset[] }` where `Asset = { publicId, resourceType }`, `referenced = { manifests: Set<string> | null, covers: Set<string> | null, dbKeys: Set<string> | null }`; throws `Error("reference source missing: <name>")` when any is null.
  - `devAssets(assets) → Asset[]` — public ids under `codedev/development/` or `codedev/test/`.
  - `coverPublicId(url) → string | null` — public id from a Cloudinary delivery URL (strip transformations and `v<digits>/`, extension and query).
  - `scripts/cloudinary-cleanup.mjs --scope dev|orphans [--env .env.production] [--local-db] [--apply]`: lists via `cloudinary.api.resources({ type: "upload", prefix: "codedev/", resource_type, max_results: 500, next_cursor })` for `image` and `video`; writes a report JSON to `os.tmpdir()/cloudinary-cleanup-<scope>-<timestamp>.json` (path printed) listing each candidate with its reason; with `--apply` reads the cloud name from stdin and compares to `CLOUDINARY_CLOUD_NAME`, then `api.delete_resources(ids, { resource_type, invalidate: true })` in batches of 100. `--local-db` (scope dev): in the local DB, `UPDATE storage.assets SET deleted_at = now() WHERE provider = 'cloudinary' AND deleted_at IS NULL` and `UPDATE profile.info SET image = NULL, avatar_asset_id = NULL WHERE avatar_asset_id IN (those ids)`.

- [ ] **Step 1: Write failing tests**: `keeps referenced assets` (each of the three sources); `old codedev/courses tree is orphaned when references moved`; `refuses without every reference source`; `devAssets matches only dev and test folders` (`codedev/production/users/...` excluded); `coverPublicId strips transformations, version and query` (input: the `coverFit.test.js` URL with `?_a=x` → `codedev/courses/x/cover`).
- [ ] **Step 2: Run** `npx vitest run __tests__/media/cloudinaryOrphans.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the module and script. Reference sources: every `content/courses/**/assets.json` (`publicId` of images and videos), every `course.json` `image` through `coverPublicId`, production DB `SELECT object_key FROM storage.assets WHERE provider = 'cloudinary' AND deleted_at IS NULL` (connection from `--env`). A failed read leaves that source `null`.
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Dry-run only** — `node scripts/cloudinary-cleanup.mjs --scope dev --env .env.production` and `--scope orphans`. Expected: report written, `0 deleted (dry run)`. Do not run `--apply` in this task.
- [ ] **Step 6: Commit** — `feat(scripts): Cloudinary cleanup (dev/test files, orphans), dry run by default`.

---

### Task 10: Production cutover and cleanup (operational, gated on the user)

No new code. Each step waits for the user's explicit go-ahead; steps 3 and 5 change production.

- [ ] **Step 1: Re-upload** — for each course in `content/courses/*`: `node content/tools/upload-media.mjs content/courses/<course> --env .env.production`. Expected: every `assets.json` `publicId` and `course.json` `image` under `codedev/production/courses/`.
- [ ] **Step 2: Rebuild** — `node content/tools/build-course.mjs content/courses/<course> --skip-uploads` per course; commit `assets.json`, `course.json`, `db/seeds/*.sql` (`chore(content): course media under codedev/production`).
- [ ] **Step 3: Publish (user go-ahead)** — `build-course.mjs <course> --skip-uploads --push --publish` per course; `node content/tools/apply-seed.mjs db/seeds/<course>.sql --env .env.production --yes`.
- [ ] **Step 4: Verify** — `git grep -n "upload/[^\"]*/codedev/courses/" content db/seeds` → no output; Sanity GROQ `count(*[_type=="lesson" && pt::text(content) match "codedev/courses/*"])` plus a JSON scan of `content[]` urls → 0; prod `SELECT count(*) FROM catalog.course WHERE image LIKE '%/codedev/courses/%'` → 0.
- [ ] **Step 5: Cleanup (user reads the dry-run reports first)** — `node scripts/cloudinary-cleanup.mjs --scope dev --env .env.production --apply`, then `--scope orphans --env .env.production --apply`; locally `--scope dev --local-db`. Expected: re-running both dry runs reports 0 candidates.
- [ ] **Step 6: Remove dev Cloudinary values** — delete `CLOUDINARY_*` from `.env.local` (user's file; tell them, do not edit secrets without asking).
