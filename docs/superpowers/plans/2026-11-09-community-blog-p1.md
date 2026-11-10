# Community Blog P1 (core posts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Learners write Markdown blog posts with images. A learner's first post waits for an admin; later posts publish at once. Admins approve, reject, hide and show posts, and settle a one-time appeal. Posts hidden for more than N days are deleted for good. The public list and post pages are cached and indexable.

**Architecture:** Postgres tables `community.post` and `community.post_asset`. Data access goes in `db/blog.db.js`, rules in `services/blog.service.js` and `services/adminBlog.service.js`, and the pure helpers in `lib/blog/`. Routes use `apiRoute`. Public pages are Server Components reading `'use cache'` getters tagged in `lib/pageCache.js`. Markdown renders on the server with `react-markdown` (no raw HTML). Image uploads go through the existing media store and `storage.assets`. A nightly Inngest cron purges posts that have been hidden too long and queues file deletion through the outbox event `storage.purge`.

**Tech Stack:** Next.js 16 App Router (Cache Components), PostgreSQL (`lib/db`, `withTransaction`), zod 4, React Query, shadcn, Inngest, Vitest, plus `react-markdown` and `remark-gfm` (new).

**Spec:** `docs/superpowers/specs/2026-11-09-community-blog-design.md` (P1 sections). P2 (likes, comments, reports) and P3 (rewards) are not in this plan. Leave `like_count`/`comment_count` at 0.

## Global Constraints

- Status values are exactly `draft | pending | published | rejected | hidden`.
- Post `public_id` is `pst_` + lower-case ULID. Asset `public_id` keeps `ast_` + ULID.
- Limits: title 3–150 characters, body 1–50,000 characters, excerpt ≤ 300 characters, 1–5 tags matching `^[a-z0-9-]{1,30}$`, at most 20 images per post, appeal reason 10–500 characters, admin reason 5–500 characters.
- Image upload: at most 5 MB; jpeg, png, gif or webp (sniffed by `detectImageType`); longest side ≤ 1600 px.
- Every write needs a signed-in user with `identity.users.email_verified = true` (`userDb.isEmailVerified({ userId })`). Otherwise answer 403 with "Verify your email to write on the blog".
- Image URLs in a body must pass `isAllowedMediaUrl(url, mediaOrigins())`. Check this when saving and again when rendering.
- `cover_asset_id` is created by the migration but not set by anything in P1: there is no cover upload UI. Leave it null.
- `BLOG_HIDDEN_PURGE_DAYS` defaults to 30, can be overridden by the env variable of the same name, and must be a positive integer.
- Permission `blog.moderate`, granted to `super_admin`, `admin` and `course_manager`.
- UI copy is in English, like the rest of the app. Comments explain only the why, one line each.
- Every schema change lands as a migration **and** as the same DDL in `db/schema.sql`. `npm run db:compare` must report no drift.

## Review Focus

1. **Vietnamese titles.** "Học React từ đầu" must give the slug `hoc-react-tu-dau-<6>`. Diacritics and `đ` must be mapped, never dropped. A title that is only symbols or emoji must still give a valid slug (`post-<6>`). Test: Task 2.
2. **Image syntax inside code blocks.** `![x](https://evil.example/a.png)` inside a fenced code block is only code. It must not count toward the 20-image cap, must not be checked against allowed origins, and must not be linked to an asset. Test: Task 2.
3. **Purge vs. appeal race.** A post with an appeal pending past N days must survive the purge. If the appeal is rejected after N days, the purge that night deletes the post. Test: Task 7.
4. **Shared images.** An author pastes the same uploaded image URL into two posts. Purging one post must not delete the file the other post still shows. Test: Task 7.
5. **Unverified email or another user's post.** An author with an unverified email gets 403 on create. Editing or deleting another user's post gives 404, never 403, so that drafts cannot be probed. Test: Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/20261109_021_community_blog.sql` | tables, indexes, permission |
| `db/schema.sql` | same DDL appended |
| `lib/keysetCursor.js` | `encodeCursor`/`decodeCursor`/`pageOf`, moved out of `services/adminFeedback.service.js` |
| `lib/blog/text.mjs` | pure helpers: slug, excerpt, image URLs, reading time, limits |
| `lib/blog/status.mjs` | pure state machine for author writes |
| `lib/validation/blog.js` | zod schemas |
| `components/blog/markdown.jsx` | safe Markdown renderer (server and client) |
| `db/blog.db.js` | SQL for posts, assets and purge |
| `services/blog.service.js` | author writes, public reads, purge |
| `services/adminBlog.service.js` | moderation, audit, notifications |
| `services/media.service.js` | add `uploadBlogImage` |
| `app/api/blog/**`, `app/api/admin/blog/**` | routes |
| `jobs/crons.js`, `jobs/index.js` | `blogPurge` cron |
| `lib/pageCache.js`, `lib/cachedData.js` | blog tags and cached getters |
| `app/(shell)/blog/**`, `components/blog/**` | list, post, editor, my posts |
| `app/admin/blog/page.jsx`, `components/admin/blog/blogQueue.jsx`, `lib/adminPermissions.js` | admin screen |
| `clients/blog.client.js`, `keys/blog.keys.js`, `queries/blog.query.js`, `mutations/blog.mutation.js` | client data layer |
| `app/layout.jsx`, `app/sitemap.js`, `app/robots.js` | SEO |

---

### Task 1: Schema and permission

**Files:**
- Create: `db/migrations/20261109_021_community_blog.sql`
- Modify: `db/schema.sql` (append the same objects in the community section)
- Test: `__tests__/blog/blogSchema.integration.test.js`

**Interfaces:**
- Produces: the tables below. Later tasks use these column names exactly.

`community.post`:
- `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `public_id varchar(40) UNIQUE NOT NULL`
- `author_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE`
- `slug varchar(100) UNIQUE NOT NULL`
- `title varchar(150) NOT NULL`
- `excerpt varchar(300) NOT NULL`
- `body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 50000)`
- `tags text[] NOT NULL CHECK (cardinality(tags) BETWEEN 1 AND 5)`
- `cover_asset_id bigint REFERENCES storage.assets(id) ON DELETE SET NULL`
- `status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','published','rejected','hidden'))`
- `reject_reason text`, `hidden_reason text`, `hidden_at timestamptz`
- `appealed_at timestamptz`, `appeal_reason varchar(500)`
- `approved_by bigint REFERENCES identity.users(id) ON DELETE SET NULL`, `approved_at timestamptz`
- `published_at timestamptz`
- `like_count int NOT NULL DEFAULT 0`, `comment_count int NOT NULL DEFAULT 0`
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz`

`community.post` indexes:
- `idx_post_published ON (published_at DESC, id DESC) WHERE status = 'published' AND deleted_at IS NULL`
- `idx_post_tags USING gin (tags) WHERE status = 'published' AND deleted_at IS NULL`
- `idx_post_author ON (author_id, updated_at DESC)`
- `idx_post_hidden ON (hidden_at) WHERE status = 'hidden'`
- `idx_post_queue ON (status, updated_at) WHERE status IN ('pending','hidden','rejected')`

`community.post_asset`:
- `post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE`
- `asset_id bigint NOT NULL REFERENCES storage.assets(id) ON DELETE CASCADE`
- `PRIMARY KEY (post_id, asset_id)`
- index `(asset_id)`

Permission: `blog.moderate` with the description "Approve, reject, hide or show learners' blog posts". Insert it with the same `INSERT … WHERE NOT EXISTS` and `setval` pattern as `20261103_014_rating_moderation.sql`, and grant it to `super_admin`, `admin` and `course_manager`.

- [x] **Step 1: Write the failing test** `blogSchema.integration.test.js` (skip without `DATABASE_URL`, following the `adminRating.integration.test.js` pattern with a TAG prefix and cleanup by `public_id LIKE`):
  - `it("rejects an unknown status")`: inserting `status = 'archived'` throws, and the error code is `23514`.
  - `it("rejects six tags")`: `tags = '{a,b,c,d,e,f}'` throws `23514`.
  - `it("cascades post_asset when the post is deleted")`: insert a post and an asset, link them, delete the post; `post_asset` has 0 rows for that post.
  - `it("grants blog.moderate to admin")`: a join over `role_permissions` returns rows for exactly `['admin','course_manager','super_admin']`.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/blogSchema.integration.test.js`. Expected: FAIL (`relation "community.post" does not exist`).
- [x] **Step 3: Write the migration** (in `BEGIN; … COMMIT;` with a header comment like the existing ones) and append the same DDL to `db/schema.sql`.
- [x] **Step 4: Run** `npm run db:migrate`, then `npm run db:compare`, then the test. Expected: the migration is applied, compare reports no differences, and the test PASSES.
- [x] **Step 5: Commit** `feat(blog): community.post and post_asset tables, blog.moderate permission`

---

### Task 2: Pure helpers, validation, shared cursor

**Files:**
- Create: `lib/blog/text.mjs`, `lib/blog/status.mjs`, `lib/validation/blog.js`, `lib/keysetCursor.js`
- Modify: `services/adminFeedback.service.js`. Replace its private `encodeCursor`/`decodeCursor`/`page` with imports from `lib/keysetCursor.js`; behavior unchanged.
- Test: `__tests__/blog/blogText.test.js`, `__tests__/blog/blogStatus.test.js`

**Interfaces (produces):**
- `BLOG_LIMITS = { title: 150, excerpt: 300, body: 50000, tags: 5, images: 20, appealReason: 500 }`
- `postSlug(title: string, publicId: string): string`
  - ASCII kebab case, at most 80 characters, then `-` and the last 6 characters of `publicId`.
  - Strip diacritics with NFD and map `đ`/`Đ` to `d`.
  - If nothing is left of the title, use `post`.
- `extractImageUrls(md: string): string[]`
  - Gives the URLs of `![alt](url)` and `![alt](url "title")`, deduplicated, in order.
  - Ignores fenced code blocks (```` ``` ```` and `~~~`) and inline code.
- `makeExcerpt(md: string, max = 300): string`
  - Plain text with Markdown syntax, code blocks and images removed, whitespace collapsed.
  - Cut at a word boundary, adding `…` when cut.
- `readingMinutes(md: string): number`: `Math.max(1, Math.ceil(words / 200))`.
- `normalizeTags(tags: string[]): string[]`: trim, lower-case, spaces to `-`, deduplicate.
- `nextStatus({ current, submit, trusted, appealing, appealedAt }): { status, appeal: boolean }`. Throws `ApiError` per the table below.

| current | input | result |
|---|---|---|
| none (create) | submit=false | `draft` |
| none / `draft` / `rejected` | submit=true | trusted ? `published` : `pending` |
| `draft` / `rejected` | submit=false | `draft` |
| `pending` with `appealedAt` null | any | `pending` |
| `pending` with `appealedAt` set | any | 409 "This post is under review" |
| `published` | any | `published` |
| `hidden` | appealing and `appealedAt` null | `pending`, appeal=true |
| `hidden` | otherwise | 403 "This post was hidden; you can appeal once" |

- `lib/validation/blog.js` (zod):
  - `postInputSchema`: `{ title, tags, body, submit: boolean default false }`. Tags go through `normalizeTags` before the regex check.
  - `postPatchSchema` = `postInputSchema.extend({ appealReason: string 10..500 optional })`
  - `postListSchema`: `{ tag?, cursor? }`
  - `adminBlogListSchema`: `{ status: 'pending'|'appeal'|'hidden'|'rejected'|'published', cursor? }`
  - `adminBlogActionSchema`: `{ action: 'approve'|'reject'|'hide'|'show', reason?: string 5..500 }`. Use `.refine` so that `reason` is required for `reject` and `hide`.
- `lib/keysetCursor.js`:
  - `encodeCursor(at, id)`
  - `decodeCursor(raw, idPattern)`, which throws `ApiError` 400
  - `pageOf(rows, size, cursorOf)`, which returns `{ items, nextCursor }`

- [x] **Step 1: Write the failing tests.**
  - `blogText.test.js`:
    - `postSlug("Học React từ đầu", "pst_01hjabcdefghjkmnpqrstvwxyz")` → `"hoc-react-tu-dau-tvwxyz"` (the last 6 characters of the id).
    - `postSlug("🔥🔥", id)` matches `^post-[a-z0-9]{6}$`.
    - A 300-character title gives a slug of at most 87 characters.
    - `extractImageUrls("![a](https://res.cloudinary.com/x.png)\n```\n![b](https://evil.example/b.png)\n```\n`![c](https://evil.example/c.png)`")` → `["https://res.cloudinary.com/x.png"]`.
    - `makeExcerpt` of a body with a heading, a code block and an image contains only the prose, and its length is ≤ 300.
    - `readingMinutes("")` → 1; `readingMinutes` of 401 words → 3.
    - `normalizeTags([" Next JS ", "nextjs", "next-js"])` → `["next-js", "nextjs"]`.
  - `blogStatus.test.js`: one `it` per table row, including both throws with `status` 409 and 403.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/blogText.test.js __tests__/blog/blogStatus.test.js`. Expected: FAIL (module not found).
- [x] **Step 3: Implement** the three `lib/blog`/`lib/validation` files and `lib/keysetCursor.js`. Switch `adminFeedback.service.js` to the shared cursor helpers.
- [x] **Step 4: Run** those tests plus `npx vitest run __tests__/admin/adminFeedback.integration.test.js`. Expected: all PASS.
- [x] **Step 5: Commit** `feat(blog): slug, excerpt, image-url and status helpers, zod schemas; shared keyset cursor`

---

### Task 3: Safe Markdown renderer

**Files:**
- Modify: `package.json`. Run `npm install react-markdown remark-gfm` and commit the lockfile.
- Create: `components/blog/markdown.jsx`
- Test: `__tests__/blog/markdown.test.jsx`

**Interfaces (produces):** `<BlogMarkdown body={string} origins={string[]} />`. It has no `"use client"`, so it works both in Server Components and inside the client editor preview.
- `ReactMarkdown` with `remarkPlugins={[remarkGfm]}` and no `rehypeRaw`; keep the default `urlTransform`.
- `img`:
  - Render only when `isAllowedMediaUrl(src, origins)`.
  - Use `loading="lazy"` and `decoding="async"`, inside a `figure` with the lesson image classes `lesson_image_wrapper`/`lesson_image`.
- `a`:
  - External `href` (absolute, other origin) gets `target="_blank" rel="nofollow ugc noopener"`.
  - Relative links stay as they are.
- `code`:
  - A block (has `language-x` class or a newline) uses `CodeBlock` from `components/ui/codeBlock.jsx` (read its props first).
  - Inline code stays a `<code>`.

- [x] **Step 1: Write the failing tests.** Render with `renderToStaticMarkup` and `origins=["https://res.cloudinary.com"]`.
  - `<script>alert(1)</script>` in the body → the output does not contain `<script`.
  - `[x](javascript:alert(1))` → the output does not contain `javascript:`.
  - `![a](https://evil.example/a.png)` → no `<img`; `![a](https://res.cloudinary.com/a.png)` → one `<img` with `loading="lazy"`.
  - `[site](https://example.com)` → contains `rel="nofollow ugc noopener"`.
  - A GFM table renders `<table`.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/markdown.test.jsx`. Expected: FAIL.
- [x] **Step 3: Implement** `components/blog/markdown.jsx`.
- [x] **Step 4: Run** the test. Expected: PASS.
- [x] **Step 5: Commit** `feat(blog): safe Markdown renderer (no raw HTML, allowed image origins, ugc links)`

---

### Task 4: Author writes and public reads (db + service)

**Files:**
- Create: `db/blog.db.js`, `services/blog.service.js`
- Modify: `lib/pageCache.js`. Add `cacheTags.blog = "blog"`, `cacheTags.post = (id) => \`post:${id}\``, and `revalidateBlog(postId = null)`, which revalidates `blog` and, when given, `post:<postId>`. Use the same try/catch shape as `revalidateCoursePage`.
- Test: `__tests__/blog/blogService.integration.test.js` (real DB, `DATABASE_URL`; create users as `adminRating.integration.test.js` does, with `email_verified = true` unless the test says otherwise)

**Interfaces:**
- Consumes: Task 1 tables; Task 2 helpers and `nextStatus`; `userDb.isEmailVerified`; `mediaOrigins()` and `isAllowedMediaUrl`; `withTransaction`; `revalidateBlog` from `lib/pageCache.js` (added in this task).
- Produces, on `blogService` (`userId` is the user's public id, as everywhere else):
  - `create({ userId, input }) → { id, slug, status }`
  - `update({ userId, postId, input }) → { id, slug, status }`. `input` is the `postPatchSchema` output; `appealReason` set means "appeal".
  - `remove({ userId, postId }) → { deleted: true }`. Soft delete: set `deleted_at`, then revalidate.
  - `listMine({ userId }) → { trusted: boolean, items: [{ id, slug, title, status, rejectReason, hiddenReason, hiddenAt, appealedAt, purgeAt, updatedAt }] }`. Items are newest first, without deleted posts; `trusted` drives the editor's button label. `purgeAt` = `hiddenAt + BLOG_HIDDEN_PURGE_DAYS` when status is `hidden`, else null.
  - `getOwn({ userId, postId }) → { id, title, tags, body, status, appealedAt, … }` for the editor. 404 when not owned.
  - `listPublished({ tag = null, cursor = null }) → { items: [{ id, slug, title, excerpt, tags, publishedAt, readingMinutes, author: { id, username, image } }], nextCursor }`. Page size 12; keyset on `(published_at, id)`.
  - `getPublishedBySlug(slug) → { id, slug, title, excerpt, body, tags, publishedAt, updatedAt, readingMinutes, author } | null`
  - `isTrusted(authorDbId)` (db): `EXISTS (SELECT 1 FROM community.post WHERE author_id = $1 AND approved_at IS NOT NULL)`
- Rules inside `create`/`update`, in one transaction:
  1. Check the verified email (403).
  2. Load the post with `FOR UPDATE`, filtered by author. Not found or `deleted_at` set → 404.
  3. Run `nextStatus`.
  4. Validate images: count > 20 → 400 "At most 20 images per post"; any URL not allowed → 400 "Images must be uploaded to CodeDev".
  5. Write the row:
     - `excerpt = makeExcerpt(body)`.
     - `slug = postSlug(title, publicId)` on create only.
     - `published_at = COALESCE(published_at, now())` when the new status is `published`.
     - Appeal: set `appealed_at = now()` and `appeal_reason`.
  6. Replace `post_asset` rows with the author's own `storage.assets` (`purpose = 'blog'`, `deleted_at IS NULL`) whose `external_url` is in the extracted URLs.
- After commit:
  - Revalidate the `blog` tag when the status is or was `published`.
  - Revalidate the `post:<publicId>` tag on every change to a published post.

- [x] **Step 1: Write the failing tests:**
  - `"first submitted post waits for review"`: create with `submit: true` → `status: "pending"`.
  - `"a trusted author publishes at once"`: set `approved_at` on post 1 directly in SQL, then create post 2 with `submit: true` → `"published"`, and `published_at` is not null.
  - `"draft stays draft"`: `submit: false` → `"draft"`.
  - `"unverified email cannot write"`: set `email_verified = false`; `create` rejects with `{ status: 403 }`.
  - `"another user's post is 404"`: `update` and `remove` by user B on A's post reject with `{ status: 404 }`.
  - `"images from other origins are refused"`: body `![a](https://evil.example/a.png)` → `{ status: 400 }`.
  - `"twenty-one images are refused"` → `{ status: 400 }`.
  - `"links own blog assets"`: insert a `storage.assets` row (`purpose 'blog'`, owner A, `external_url` on `https://res.cloudinary.com/...`) and use it in the body → 1 `post_asset` row. Remove it from the body and update → 0 rows. Another user's asset with the same URL pattern is never linked.
  - `"hidden post can be appealed once"`: set status `hidden` in SQL; `update` with `appealReason` → `pending`, `appealed_at` set; a second update → 409. After setting `hidden` again in SQL (appeal already used), an update → 403.
  - `"public reads show only published"`:
    - `getPublishedBySlug` of a pending post → null.
    - `listPublished({ tag })` filters by tag.
    - 13 published posts give `nextCursor`, and the second page has 1 item.
  - `"remove hides it from public reads"`.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/blogService.integration.test.js`. Expected: FAIL.
- [x] **Step 3: Implement** `db/blog.db.js` (SQL only, `client.query` inside transactions, `sql` outside) and `services/blog.service.js`.
- [x] **Step 4: Run** the test. Expected: PASS.
- [x] **Step 5: Commit** `feat(blog): author writes with first-post review and one appeal, public reads`

---

### Task 5: Blog image upload

**Files:**
- Modify: `services/media.service.js` (add `uploadBlogImage`), `db/media.db.js` (add `insertAsset({ ownerId, asset, purpose })`)
- Test: `__tests__/media/blogImageUpload.test.js` (mock `@/lib/media/mediaStore` exactly as `avatarUpload.test.js` does)

**Interfaces (produces):** `mediaService.uploadBlogImage({ userId, file }) → { url, width, height }`
- Same validation as `uploadAvatar`: same messages, 5 MB, `detectImageType`. Also check the verified email (403).
- Key `users/${userId}/blog/${ulid}`, `maxSide: 1600`, `allowedFormats: ACCEPTED_IMAGE_FORMATS`.
- Store `purpose: "content"`, because Payload `media.purpose` only accepts `content|avatar`. The `storage.assets.purpose` is `'blog'`.
- If saving the row fails, destroy the upload, as `uploadAvatar` does.

- [x] **Step 1: Write the failing tests:**
  - A 1×1 PNG → resolves `{ url }`; the mock store saw a key matching `^users/[^/]+/blog/[0-9a-z]{26}$` and `maxSide: 1600`; one `storage.assets` row with `purpose = 'blog'`.
  - A 6 MB buffer → `{ status: 413 }`.
  - A text file → `{ status: 415 }`.
  - Unverified email → `{ status: 403 }`.
- [x] **Step 2: Run** `npx vitest run __tests__/media/blogImageUpload.test.js`. Expected: FAIL.
- [x] **Step 3: Implement.** Extract the shared validate-and-upload part of `uploadAvatar` into a private `uploadImage({ userId, file, key, maxSide, storePurpose })`, so the two functions do not duplicate it. `uploadAvatar`'s behavior stays the same.
- [x] **Step 4: Run** this test plus `npx vitest run __tests__/media`. Expected: all PASS.
- [x] **Step 5: Commit** `feat(blog): image upload to the media store as storage.assets purpose blog`

---

### Task 6: Learner API routes

**Files:**
- Modify: `lib/rateLimit.js`. Add `blogCreate: new RateLimiter({ limit: 5, windowSeconds: 3600, prefix: "blog-create" })` and `blogWrite: new RateLimiter({ limit: 30, windowSeconds: 60, prefix: "blog-write" })`.
- Create: `app/api/blog/posts/route.js` (GET, POST), `app/api/blog/posts/[id]/route.js` (GET own, PATCH, DELETE), `app/api/blog/posts/mine/route.js` (GET), `app/api/blog/images/route.js` (POST multipart)
- Test: `__tests__/blog/blogRoutes.test.js`

**Interfaces:**
- Consumes: Task 4 `blogService`, Task 5 `mediaService.uploadBlogImage`, Task 2 schemas, `parseOrThrow`/`readJson`/`publicId` from `lib/validation/premium.js`.
- Route settings:

| Route | `auth` | `csrf` | `limiter` |
|---|---|---|---|
| `GET /api/blog/posts` | `"none"` | – | – |
| `POST /api/blog/posts` | required | `true` | `blogCreate` |
| `PATCH /api/blog/posts/[id]` | required | `true` | `blogWrite` |
| `DELETE /api/blog/posts/[id]` | required | `true` | `blogWrite` |
| `GET /api/blog/posts/[id]` | required | – | – |
| `GET /api/blog/posts/mine` | required | – | – |
| `POST /api/blog/images` | required | `true` | `upload` |

- `GET /api/blog/posts` sends `cacheControl: "public, s-maxage=60, stale-while-revalidate=300"`.
- `POST /api/blog/posts` returns status 201.
- `POST /api/blog/images` reads `(await req.formData()).get("file")`.
- `[id]` is a post `public_id` checked with `/^pst_[0-9a-z]{26}$/`, else 400.

- [x] **Step 1: Write the failing test.** Import `GET` from `app/api/blog/posts/route.js` and call it with a `Request`; this route uses `auth: "none"`, so it needs no session.
  - `?tag=Bad%20Tag!` → status 400.
  - `?cursor=not-a-cursor` → status 400.
  - With `DATABASE_URL` set, a valid request returns 200 with `{ success: true, data: { items, nextCursor } }` and the header `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

  The protected routes are covered by the service tests (Task 4) and the preview steps (Task 9).
- [x] **Step 2: Run** `npx vitest run __tests__/blog/blogRoutes.test.js`. Expected: FAIL.
- [x] **Step 3: Implement** the routes and limiters.
- [x] **Step 4: Run** the test. Expected: PASS.
- [x] **Step 5: Commit** `feat(blog): learner API routes and rate limits`

---

### Task 7: Moderation, appeal decisions and purge

**Files:**
- Create: `services/adminBlog.service.js`, `app/api/admin/blog/route.js` (GET), `app/api/admin/blog/[id]/route.js` (PATCH)
- Modify: `db/blog.db.js` (admin queries, purge), `services/blog.service.js` (`runHiddenPurge`), `jobs/crons.js`, `jobs/index.js`
- Test: `__tests__/blog/adminBlog.integration.test.js`, `__tests__/blog/blogPurge.integration.test.js`

**Interfaces:**
- `adminBlogService.list({ status, cursor })` → `{ items: [{ id, slug, title, excerpt, status, author, rejectReason, hiddenReason, hiddenAt, appealedAt, appealReason, purgeAt, updatedAt }], nextCursor }`
  - `appeal` = `status = 'pending' AND appealed_at IS NOT NULL`
  - `pending` = `status = 'pending' AND appealed_at IS NULL`
  - Oldest first for the queues, newest first for `published`.
- `adminBlogService.act({ actor, postId, action, reason, ip })` → `{ changed: boolean, status }`. Runs in one transaction with the row locked, then writes `adminDb.audit` with `action: "blog.<action>"`, `targetType: "post"`, `targetId: postId`, and before/after `{ status }`.

| from | action | to | side effects |
|---|---|---|---|
| `pending`, no appeal | approve | `published` | `approved_by`, `approved_at = now()`, `published_at = COALESCE(published_at, now())` |
| `pending`, no appeal | reject | `rejected` | `reject_reason` |
| `pending`, appeal | approve | `published` | `hidden_at = NULL`, `hidden_reason = NULL` |
| `pending`, appeal | reject | `hidden` | keep `hidden_at` and `appealed_at` |
| `published` | hide | `hidden` | `hidden_at = now()`, `hidden_reason` |
| `hidden` | show | `published` | `hidden_at = NULL`, `hidden_reason = NULL` |
| same target | any | – | `{ changed: false }` |
| anything else | – | – | 409 "Not allowed from <status>" |

- Notifications after commit, via `notificationService.notify(authorPublicId, { kind, title, message, link, dedupeKey: "blog:<postId>:<action>" })`. Use `kind: "system"` for approve and appeal approve, and `"content_hidden"` for reject, hide and appeal reject. Messages:
  - approve → title "Post published", link `/blog/<slug>`
  - reject → title "Post not approved", message includes the reason, link `/blog/me`
  - hide → title "Post hidden", message: `"Hidden: <reason>. It will be deleted on <purge date> unless it is restored. You can appeal once from My posts."`
  - appeal rejected → title "Appeal rejected", message includes the purge date
- Revalidate `blog` and `post:<id>` after every change.
- Routes:
  - GET requires `requirePermission(userId, ["admin.read", "blog.moderate"])`.
  - PATCH uses `csrf: true`, `limiter: rateLimiters.admin`, and passes `ip: RateLimiter.getClientIp(req)`, following `app/api/admin/comments/[id]/route.js`.
- Purge settings:
  - `BLOG_HIDDEN_PURGE_DAYS`, exported from `services/blog.service.js`: `Number(process.env.BLOG_HIDDEN_PURGE_DAYS) || 30`, rejecting non-positive values.
- `blogService.runHiddenPurge({ limit = 50, days = BLOG_HIDDEN_PURGE_DAYS }) → { purged: number, files: number, outboxIds: string[] }`. In one transaction:
  1. `SELECT … FROM community.post WHERE status = 'hidden' AND hidden_at < now() - make_interval(days => $1) ORDER BY hidden_at LIMIT $2 FOR UPDATE SKIP LOCKED`.
  2. Collect the assets linked through `post_asset` that are not referenced by any post outside this batch. Set `deleted_at = now()` on them and build `files: [{ provider, key: object_key, bucket: null }]`.
  3. `DELETE FROM community.post WHERE id = ANY($1)`.
  4. If there are files, insert `identity.auth_outbox ('storage.purge', {files})`, exactly as `db/accountPurge.db.js` does.
  5. After commit, `dispatchAuthOutbox(outboxIds)` and revalidate `blog` plus each `post:<id>`.
- Cron `blogPurge` in `jobs/crons.js`:
  - `{ id: "blog-purge", triggers: [{ cron: "15 3 * * *" }], concurrency: 1, retries: 2 }`
  - Batches loop like `accountMaintenance` with `MAX_BATCHES`; stop when `purged === 0`; return the totals.
  - Add it to `functions` in `jobs/index.js`.

- [x] **Step 1: Write the failing tests.**
  - `adminBlog.integration.test.js`:
    - approve pending → published, and an audit row `blog.approve`.
    - After approve, the author's next submit publishes at once (calls `blogService.create`).
    - reject requires a reason: the schema test, then the service returns `rejected` and stores the reason.
    - hide then show round-trips `hidden_at` (set, then null).
    - Appeal approve clears `hidden_at`.
    - Appeal reject keeps the original `hidden_at`.
    - `approve` on a `draft` → 409.
    - The same action twice → `{ changed: false }`.
  - `blogPurge.integration.test.js` (use `days: 30` and set `hidden_at` in SQL):
    - Hidden 31 days ago → purged; hidden 29 days ago → kept.
    - A `pending` appeal with `hidden_at` 40 days ago → kept. After `act(reject)` on the appeal → purged by the next run.
    - Shown (`hidden_at` null, `published`) → kept.
    - Shared asset: post X (hidden 31 days) and post Y (published) both link asset S, and X alone links asset T. After the purge, T has `deleted_at` set and is in the outbox payload; S has no `deleted_at` and is absent from the payload.
    - A second run → `{ purged: 0 }` and no new outbox row.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/adminBlog.integration.test.js __tests__/blog/blogPurge.integration.test.js`. Expected: FAIL.
- [x] **Step 3: Implement** the service, the routes, the purge and the cron.
- [x] **Step 4: Run** both tests plus `npx vitest run __tests__/auth/inngestEnv.test.js` (function registry). Expected: PASS.
- [x] **Step 5: Commit** `feat(blog): moderation with appeal decisions, audit and notices; nightly purge of posts hidden past N days`

---

### Task 8: Cache tags and public pages

Before any UI code: run the skill `ui-consistency:finding-patterns` for the blog list, the post page, the editor and the admin queue. Save its checklist next to this plan as `docs/superpowers/plans/2026-11-09-community-blog-p1.ui-checklist.md`. Tasks 8–10 follow that checklist.

**Files:**
- Modify: `lib/cachedData.js`. Use the `cacheTags.blog`/`cacheTags.post` added in Task 4. Add both getters with `cacheLife({ stale: 300, revalidate: 600, expire: 86_400 })`:
  - `getBlogPage(tag = null)`, `'use cache'`, `cacheTag(cacheTags.blog)`, wraps `blogService.listPublished({ tag })`.
  - `getPublicPost(slug)`, `'use cache'`, `cacheTag` of `cacheTags.post(<id>)` after the read and `cacheTag(cacheTags.blog)` too, wraps `getPublishedBySlug`.
- Modify: `app/(shell)/blog/page.jsx`, `components/blog/blog.jsx`. `blog.jsx` becomes a server component taking `{ initial, tag }`. It renders the tag chips (`/blog?tag=x`), the post cards, a "Write a post" button (`/blog/new`), and keeps the current empty state when there are no items.
- Create: `components/blog/loadMore.jsx` (client island, `useInfiniteQuery` on `GET /api/blog/posts`, starting from `initial.nextCursor`)
- Create: `app/(shell)/blog/[slug]/page.jsx`, `components/blog/postPage.jsx`
- Create: `clients/blog.client.js`, `keys/blog.keys.js`, `queries/blog.query.js` (list only for now; Task 9 adds the rest)

**Interfaces:**
- `/blog/[slug]`:
  - `generateMetadata`:
    - title `"<title> | CodeDev Blog"`, description = excerpt
    - `alternates.canonical: /blog/<slug>`
    - `openGraph: { type: "article", publishedTime, modifiedTime, authors: [username] }`
    - `twitter.card = "summary"`
  - The page awaits `params` outside `<Suspense>` and sets `export const instant = false`, as `app/course/[id]/page.jsx` does. `notFound()` when `getPublicPost` returns null.
  - Body: `<BlogMarkdown body origins={mediaOrigins()} />`.
  - JSON-LD `BlogPosting` (`headline`, `description`, `datePublished`, `dateModified`, `author: { @type: Person, name, url: /profile/<id> }`, `mainEntityOfPage`), with `<` escaped as `<` in the serialized JSON.
  - No `generateStaticParams` (user content; ISR per slug on first visit).

- [x] **Step 1: Run** `ui-consistency:finding-patterns` and save the checklist.
- [x] **Step 2: Implement** the cache tags, getters, pages and island.
- [x] **Step 3: Verify** with `npm run build`. Expected: the build passes; `/blog` and `/blog/[slug]` are not listed as fully dynamic (`ƒ`) because of a cookie or header read.
- [x] **Step 4: Verify** in the preview (`npm run dev`, with posts created through the API from Task 6):
  - `/blog` shows the cards, `?tag=` filters, and "Load more" appends.
  - `/blog/<slug>` renders the body, a code block and an image.
  - An unknown slug and a pending post's slug both give 404.
  - `view-source` has `application/ld+json` and `og:type` `article`.
- [x] **Step 5: Commit** `feat(blog): cached public list and post pages with metadata and JSON-LD`

---

### Task 9: Editor and My posts

**Files:**
- Create: `app/(shell)/blog/new/page.jsx`, `app/(shell)/blog/[slug]/edit/page.jsx` (looks up the post by the `?id=` query param; the slug in the path is for the user's URL only), `app/(shell)/blog/me/page.jsx`
- Create: `components/blog/postEditor.jsx` (client), `components/blog/myPosts.jsx` (client)
- Create: `mutations/blog.mutation.js`
- Modify: `clients/blog.client.js`, `keys/blog.keys.js`, `queries/blog.query.js`

**Interfaces:**
- Consumes: Task 6 routes and Task 3 `BlogMarkdown`. Load it in the preview with `next/dynamic` so the editor's first paint does not include it.
- `postEditor.jsx`:
  - Fields: title, a tags input (comma or Enter adds a chip, max 5), and a Markdown textarea.
  - Tabs "Write" / "Preview".
  - "Add image" button plus pasting an image from the clipboard. Each image goes to `POST /api/blog/images`, then `![image](<url>)` is inserted at the cursor. While the upload runs, show a placeholder `![Uploading…]()` and replace it when done.
  - Buttons:
    - "Save draft" sends `submit: false`.
    - "Submit for review" when the author has no approved post yet, otherwise "Publish". This is a label only; the server decides the status. The label comes from `trusted` in the `GET /api/blog/posts/mine` response (Task 4).
  - A hidden post that has not been appealed shows an "Appeal reason" textarea, and the submit button reads "Send appeal".
  - Server error messages show through `useApp().showAlert`, as in the admin lists.
- `myPosts.jsx`:
  - Shows each post with a status badge, `rejectReason` / `hiddenReason`, "Deletes on <date>" for hidden posts, Edit and Delete actions (confirm dialog), and the "Appeal rejected" text when `status === 'hidden' && appealedAt`.
- The private pages need a session: redirect to `/auth` as `app/studio/[[...tool]]/page.jsx` does. Set `export const instant = false`.
- `app/robots.js` (Task 11) blocks these paths. Each page also sets `robots: { index: false }` in its metadata.

- [x] **Step 1: Implement** the data layer and the components.
- [x] **Step 2: Verify** in the preview:
  1. User A (unapproved) writes a post, pastes an image (it appears in Preview), and clicks "Submit for review".
  2. `/blog/me` shows "Pending".
  3. Editing a pending post keeps it pending.
  4. Deleting the post asks for confirmation, then removes it from the list.
  5. An unverified user sees the 403 message.
  6. Check at 375 px width and in dark mode.
- [x] **Step 3: Commit** `feat(blog): Markdown editor with image paste, my posts with status and appeal`

---

### Task 10: Admin screen

**Files:**
- Modify: `lib/adminPermissions.js`. Add `{ key: "blog", href: "/admin/blog", label: "Blog", permission: "blog.moderate", group: "Content" }`, and give it an icon in `components/admin/shell/adminShell.jsx` (for example `LuNewspaper`).
- Create: `app/admin/blog/page.jsx` (same shape as `app/admin/feedback/page.jsx`, gated by `adminCan("blog.moderate")`), `components/admin/blog/blogQueue.jsx`
- Modify: `clients/premium.client.js` (`adminClient.listBlog`, `adminClient.actOnBlog`), `keys/admin.keys.js`, `mutations/premium.mutation.js` (`useAdminBlogAction = () => useAdminWrite(…)`)

**Interfaces:**
- `blogQueue.jsx`:
  - Status tabs: Pending / Appeals / Hidden / Rejected / Published.
  - Built the way `commentList.jsx` builds its list: `useInfiniteQuery`, `RowAction`, `ConfirmDialog` with a reason field for reject and hide.
  - Appeal rows show the appeal reason next to the old hidden reason.
  - Hidden rows show "Deletes in X days" from `purgeAt`.
  - Each row has a "View" link: published posts open the public page; other posts open a read-only `BlogMarkdown` preview inside a dialog.

- [x] **Step 1: Implement** the screen.
- [x] **Step 2: Verify** in the preview as an admin:
  1. Approve A's pending post. A gets a notification, and the post appears on `/blog`.
  2. A's next post publishes at once.
  3. Hide a post. It leaves `/blog` and `/blog/<slug>` gives 404. A's `/blog/me` shows the deletion date.
  4. A appeals. The post shows under Appeals; reject the appeal and it is back under Hidden with the same date.
  5. The audit page lists the `blog.*` actions.
- [x] **Step 3: Commit** `feat(blog): admin moderation queue with appeals and purge dates`

---

### Task 11: Site SEO

**Files:**
- Modify: `app/layout.jsx` (`metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000")`)
- Create: `app/sitemap.js`, `app/robots.js`
- Test: `__tests__/blog/sitemap.test.js`

**Interfaces:**
- `sitemap()`:
  - Lists `/`, `/course`, `/roadmap`, `/about`, `/blog` and `/help`.
  - Lists every published post as `/blog/<slug>` with `lastModified = updatedAt`, read through a new `blogService.listSitemap()` that returns slug and `updated_at` only, capped at 5,000.
  - Lists `/course/<id>` for `getPrerenderedCourseIds()`.
  - URLs are absolute, built from `NEXTAUTH_URL`. A post-read failure leaves out the posts and keeps the rest.
- `robots()`:
  - `rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/studio", "/api", "/learning", "/settings", "/blog/new", "/blog/me"] }`
  - `sitemap: <origin>/sitemap.xml`

- [x] **Step 1: Write the failing test.** Mock `blogService.listSitemap` and `getPrerenderedCourseIds`.
  - Each entry's `url` starts with the `NEXTAUTH_URL` origin.
  - A post entry exists with the right `lastModified`.
  - When `listSitemap` rejects, the static entries are still present.
- [x] **Step 2: Run** `npx vitest run __tests__/blog/sitemap.test.js`. Expected: FAIL.
- [x] **Step 3: Implement** the three files.
- [x] **Step 4: Run** the test, then check in the preview that `/sitemap.xml` and `/robots.txt` are served. Expected: PASS, and both serve.
- [x] **Step 5: Commit** `feat(seo): metadataBase, sitemap with blog posts and courses, robots`

---

### Task 12: Whole-branch verification

- [x] **Step 1: Run** `npm run lint`, then `npm test`, then `npm run build`. Expected: all pass, and the bundle budget check `npm run budget` passes.
- [x] **Step 2: Run** the skill `ui-consistency:verifying` against the Task 8 checklist and fix what it reports.
- [x] **Step 3: Run** the spec's preview flow end to end (spec "Kiểm thử", steps 1–7). For step 6:
  1. Set one hidden post's `hidden_at` to 31 days ago in the local DB.
  2. Trigger `blog-purge` from the Inngest dev server.
  3. The post row is gone, and its image is gone from the local Payload media list.
- [x] **Step 4: Commit** any fixes: `fix(blog): …`
