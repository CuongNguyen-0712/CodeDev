# Media storage: Payload CMS locally, Cloudinary for production only

Date: 2026-11-09. Status: design approved in chat, awaiting spec review.

## 1. Goal

- Local development and test never read from or write to Cloudinary. Every image and video
  upload (lesson diagrams, course covers, lesson videos, user avatars) goes to the local Payload
  CMS, which keeps the files in the MinIO of `compose.yml`.
- Production keeps Cloudinary for delivery. Cloudinary holds production files only, all under
  `codedev/production/`.
- The existing Cloudinary account is cleaned up: development and test files deleted, orphans
  deleted, production content moved under the environment folder.

Success criteria:

1. `npm run services:up && npm run cms:up && npm run cms:sync && npm run dev` shows every lesson
   diagram, cover and video with no `CLOUDINARY_*` variable set.
2. Avatar upload, history, restore and delete work locally against Payload.
3. A development run cannot overwrite a production asset (no shared public id, no Cloudinary
   credentials needed).
4. After cleanup, every Cloudinary asset sits under `codedev/production/` and is referenced by
   the repo, Sanity or the production database.

## 2. Current state (for reference)

| Area | Today |
|---|---|
| Avatars | `services/media.service.js` uploads to Cloudinary `<root>/<APP_ENV>/users/<id>/avatars/<ulid>`, row in `storage.assets` (`provider='cloudinary'`) |
| Account purge | `services/authOutbox.service.js` `storage.purge`: Cloudinary or S3 by provider |
| Lesson diagrams | `content/tools/upload-images.mjs` -> Cloudinary `codedev/courses/<course>/<lesson>/<name>` (no env segment), URLs in committed `assets.json` |
| Course covers | `content/tools/upload-cover.mjs` -> Cloudinary `codedev/courses/<course>/cover`, URL in `course.json` and seeds |
| Lesson bodies | Payload locally, Sanity in production (`docs/payload-cms.md`); image blocks are `cloudinaryImage` with a URL |
| Rendering | `components/ui/portableTextRenderer.jsx` renders only `https://res.cloudinary.com/` images; `next.config.js` allows that host |
| Video | URL only (`video` block: YouTube, Vimeo or a direct URL); no file storage |
| Payload | collections `users`, `lessons`; no upload collection |

## 3. Content media (diagrams, covers, videos)

### 3.1 Source files

Committed in the repo, the single source for every environment:

- `content/courses/<course>/cover.svg`
- `content/courses/<course>/<lesson>/diagrams/*.{svg,png,jpg,webp}`
- `content/courses/<course>/<lesson>/videos/*.{mp4,webm}` through Git LFS
  (`.gitattributes`: `*.mp4 filter=lfs diff=lfs merge=lfs -text`, same for `*.webm`)

### 3.2 `content/tools/upload-media.mjs`

Replaces `upload-images.mjs` and `upload-cover.mjs`.

```
node content/tools/upload-media.mjs <course folder | lesson folder> [--env <file>] [--dry-run]
```

Default env file `.env.local`. The target follows `APP_ENV` of that file (`lib/appEnv.mjs`):

| APP_ENV | Target | Manifest |
|---|---|---|
| `production` | Cloudinary, public id `codedev/production/courses/<course>/<lesson>/<name>` (cover: `codedev/production/courses/<course>/cover`); videos with `resource_type: "video"` | `assets.json` / `course.json` `image` (committed) |
| `development`, `test` | Payload `media` collection over REST (`PAYLOAD_URL`, `PAYLOAD_API_KEY`), `key` = `courses/<course>/<lesson>/<name>` | `assets.local.json` / `course.local.json` (gitignored) |

- Guards: production target requires `APP_ENV=production` in the env file; local target refuses a
  `PAYLOAD_URL` that is not on this machine (`isLocalUrl`). Same style as `push-lesson*.mjs`.
- Idempotent: the manifest records `checksum` (sha256 of the source file); unchanged files are
  skipped. Changed files overwrite the same key / public id.
- Covers: `cover.svg` rendered to PNG with `sharp` (as today), then uploaded to either target.
- Videos: max 200 MB per file. Production uses `upload_large` (chunked) above 20 MB.
- Manifest entry shape (both files):
  `{ key, url, width, height, format, bytes, checksum, provider }`, plus `publicId` for
  Cloudinary and `duration` for videos, under `images.<name>` and `videos.<name>`.

### 3.3 Payload `media` collection (`cms/src/collections/Media.ts`)

- `upload: true`, `mimeTypes`: `image/png`, `image/jpeg`, `image/webp`, `image/gif`,
  `image/svg+xml`, `video/mp4`, `video/webm`.
- Fields: `key` (text, unique, indexed), `purpose` (select `content` | `avatar`), `alt` (text).
- Access: `read` public; `create`, `update`, `delete` need a signed-in user or API key.
- Avatar resize: a `beforeOperation` hook on `create` resizes the file buffer with `sharp` to
  fit 512x512 (`fit: inside`, no enlargement) when `purpose = avatar`, so the original is not
  kept, matching Cloudinary's incoming transformation. Collection-wide `resizeOptions` is not
  used because it would also shrink content diagrams. Adds `sharp` to `cms/package.json`.
- Storage: `@payloadcms/storage-s3` on the `media` collection, endpoint `MINIO_ENDPOINT`
  (inside Docker: `http://minio:9000`), bucket `S3_MEDIA_BUCKET` (default `media`),
  `forcePathStyle: true`. Files are served by Payload at `<PAYLOAD_URL>/api/media/file/<filename>`.
- `compose.yml`: `cms` gets the MinIO variables and joins the network MinIO is on;
  `scripts/storage-sync.mjs --init` creates the `media` bucket.
- One Payload migration (`npm --prefix cms run migrate:create media`).

### 3.4 Build and render

- `content/tools/build-lesson.mjs` takes the manifest for the store being built:
  `assets.json` for Sanity (`push-lesson.mjs`, `build-course.mjs --push`),
  `assets.local.json` for Payload (`payload-sync.mjs`, `build-course.mjs --payload`).
  A missing key throws: `image "<name>" is not in <manifest> - run upload-media.mjs`.
- Block types stay `cloudinaryImage` and `video` so the Sanity schema is unchanged; a
  `video` block built from a file carries `url`, `width`, `height`, `mime`.
- `portableTextRenderer.jsx`: `CloudinaryImage` becomes `MediaImage`; the URL must start with
  an allowed origin: `https://res.cloudinary.com/` always, `PAYLOAD_URL` (public variant
  `NEXT_PUBLIC_PAYLOAD_URL`) only when not production. `VideoEmbed` uses the same check for
  direct files; YouTube and Vimeo unchanged.
- `next.config.js`: remote pattern for the Payload origin added only when `APP_ENV` is not
  production.
- `npm run cms:sync`: runs `upload-media.mjs` for every course (local target) before pushing
  lessons.
- Seeds: committed seeds keep the production cover URL. `apply-seed.mjs` against a local
  database replaces `catalog.course.image` with the URL from `course.local.json`; missing
  -> error naming `npm run cms:sync`.

## 4. Avatars (runtime uploads)

### 4.1 Store interface (`lib/media/`)

```
mediaStore() -> cloudinaryStore | payloadStore     // chosen once from APP_ENV
store.isConfigured(): boolean
store.upload(buffer, { key, mime, maxSide, purpose }) ->
    { provider, objectKey, url, width, height, format, version, bytes }
store.destroy(objectKey): "ok" | "not found"       // throws on other failures
```

- `cloudinaryStore` (`lib/media/cloudinaryStore.js`): production only; wraps today's
  `lib/cloudinary.js`. Folder `<CLOUDINARY_ROOT_FOLDER>/production/...`.
- `payloadStore` (`lib/media/payloadStore.js`): development and test; `POST
  <PAYLOAD_URL>/api/media` multipart with `key`, `purpose`; `DELETE /api/media/<id>`
  (`objectKey` = Payload document id). 404 on delete counts as `not found`.
- Selection: production -> Cloudinary; anything else -> Payload. No fallback between them.

### 4.2 Service and data

- `services/media.service.js` keeps its flow (magic-byte check, upload, one transaction,
  cleanup after commit, delete the upload when the DB write fails) and calls `mediaStore()`.
- Not configured -> 503 "Image uploads are not available right now"; in development the log
  names `npm run cms:up`.
- `db/media.db.js` writes the store's `provider` instead of the literal `'cloudinary'`.
- Migration: `storage.assets` `chk_assets_provider` allows `'s3'`, `'cloudinary'`, `'payload'`;
  `db/schema.sql` updated.
- `destroyFile` and `storage.purge` dispatch by provider: `cloudinary` -> Cloudinary,
  `payload` -> Payload, otherwise S3.

### 4.3 Environment checks

- `lib/envCheck.mjs`: production requires `CLOUDINARY_*` and errors when `PAYLOAD_URL` is set;
  development warns when `CLOUDINARY_*` is set ("ignored outside production") and reports a
  missing `PAYLOAD_URL` / `PAYLOAD_API_KEY` as "uploads disabled".
- `.env.example`: `CLOUDINARY_*` moved to the production section; `S3_MEDIA_BUCKET` added.

## 5. Cloudinary cleanup

Order matters: references move before any file is deleted.

1. **Re-upload production content** (no `rename`, which would break live URLs at once):
   `upload-media.mjs --env .env.production` for every course, rebuild `assets.json`,
   `course.json`, seeds; push Sanity (`build-course.mjs --push`); apply the seed to production.
2. **Verify**: no reference to `codedev/courses/` remains in the repo, in Sanity lesson
   documents, or in production `catalog.course.image`.
3. **`scripts/cloudinary-cleanup.mjs`**: read-only by default, writes a report;
   deletes only with `--apply` and the cloud name typed to confirm.
   - `--scope dev`: every asset under `codedev/development/` and `codedev/test/`; with
     `--local-db`, soft-deletes local `storage.assets` rows with `provider='cloudinary'` and
     sets `profile.info.image` / `avatar_asset_id` to NULL where they point to them.
   - `--scope orphans`: lists every asset under `codedev/` (Admin API, image and video) and
     subtracts the referenced set: every `assets.json` public id, every `course.json` cover,
     `object_key` of live production `storage.assets` rows. The rest is deleted. Refuses to run
     unless all three sources were read. Includes the old `codedev/courses/` tree.
   - Deletes with `delete_resources` in batches of 100, `invalidate: true`.
   - The orphan calculation is a pure function (`lib/media/cloudinaryOrphans.mjs`).
4. **Code cleanup**: remove `upload-images.mjs`, `upload-cover.mjs`; `cloudinaryFolder` loses
   the `APP_ENV` segment logic (always `production`); update `README.md`,
   `docs/environments.md`, `docs/payload-cms.md`, `.env.example`.

## 6. Error handling

| Case | Behaviour |
|---|---|
| CMS not running (dev avatar upload) | 503, log names `npm run cms:up` |
| CMS not running (`upload-media`, `cms:sync`) | exit 1 with the command to run |
| Manifest key missing at build | throw naming the manifest and `upload-media.mjs` |
| Payload delete 404 / Cloudinary "not found" | counted as deleted |
| DB write fails after upload | upload destroyed in its store (unchanged behaviour) |
| Cleanup cannot read a reference source | refuse, nothing deleted |
| Video over 200 MB | rejected by the tool and by Payload |

## 7. Testing

Vitest:

- `mediaStore` selection per `APP_ENV`; production never returns `payloadStore`.
- `payloadStore` with mocked `fetch`: upload response mapping, destroy, 404 on destroy.
- `media.service` existing cases run against both stores (orphan rollback, prune, restore,
  delete current refused).
- `storage.purge` dispatch for `cloudinary`, `payload`, `s3`.
- `upload-media` target guards (production env required; non-local `PAYLOAD_URL` refused)
  and checksum skip.
- `cloudinaryOrphans` with fixtures; refusal when a source is missing.
- Renderer allowlist: foreign URL rejected; Payload origin accepted only outside production.

Manual: `npm run cms:up && npm run cms:sync`, open a lesson with a diagram and a video in the
browser, upload / restore / delete an avatar, run the cleanup script in dry-run against the
real account and read the report.

## 8. Out of scope

- Admin or learner UI for uploading videos (content tooling only).
- Moving production lesson bodies off Sanity.
- Image transformations in development beyond the avatar resize.
