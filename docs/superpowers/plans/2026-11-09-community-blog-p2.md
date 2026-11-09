# Community Blog P2 (likes, comments, reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Readers like a post, comment under it and report it. Admins see reported posts and blog comments, and can hide them. The redesigned list and post page show live like and comment counts.

**Architecture:** Three new tables in `community`, written in the same transaction as the `like_count` and `comment_count` counters on `community.post`. Reads and writes go through `db/blog.db.js`, `services/blogInteraction.service.js` and `services/adminBlog.service.js`. The post page stays a cached Server Component. A client island fetches the viewer's state (liked, reported, own) and the live counts. Comments are a second island using React Query.

**Tech Stack:** As P1: Next.js 16 (Cache Components), PostgreSQL, zod 4, React Query, shadcn, `react-icons/lu`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-community-blog-design.md` (P2 parts of "Dữ liệu", "API", "Trang"). Builds on P1 (`docs/superpowers/plans/2026-11-09-community-blog-p1.md`, branch `feature/community-blog`). P3 rewards are out of scope.

## Global Constraints

- `community.post_like (post_id, user_id, created_at)`, PK `(post_id, user_id)`.
- `community.post_comment`: `id`, `public_id` (`pcm_` + lower-case ULID), `post_id`, `user_id`, `body` (plain text, 1–2000 characters after trim), `is_hidden`, `is_deleted`, `created_at`. Comments are flat, not nested.
- `community.post_report (post_id, reporter_id, reason, created_at, resolved_at)`, unique `(post_id, reporter_id)`.
- `like_count` and `comment_count` change in the same transaction as the row they count. `comment_count` counts comments that are neither hidden nor deleted.
- Liking, commenting and reporting need a signed-in user with a verified email. Otherwise answer 403 "Verify your email to write on the blog" (the P1 message).
- The target post must be `published` and not deleted; any other state is 404.
- Nobody can like or report their own post: answer 400 "You cannot like your own post" or "You cannot report your own post".
- Rate limits: likes use `rateLimiters.vote`, comments use `rateLimiters.comment`, reports use `rateLimiters.feedback`.
- Report reason: 5–500 characters. A second report by the same user answers 409 "You already reported this post".
- Ids leaving `db/` are public ids (`pst_…`, `pcm_…`, user public ids), as in P1 Ruling B/G.
- UI copy is in English. Icons come from `react-icons/lu`. Use house shadcn components and theme tokens only.

## Review Focus

1. **Double click or concurrent like:** liking twice keeps one row and the count goes up by one. Unliking something not liked changes nothing and the count never goes below 0. Test: Task 2.
2. **Hidden, then deleted comment, or the reverse:** the count goes down exactly once. Showing a hidden comment that its author has since deleted does not bring it back. Test: Task 3.
3. **A post hidden while readers are on its page:** liking, commenting or reporting it answers 404, never a 500. Test: Task 2 (like), Task 3 (comment).
4. **Comment text with Markdown or HTML:** it renders as plain text, with line breaks kept and nothing interpreted. Test: Task 6.
5. **A signed-out reader clicks like or report:** they are sent to `/auth?next=/blog/<slug>`, not shown an error. Test: Task 5 (browser check by the controller).

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/20261109_022_blog_interactions.sql` | three tables, indexes |
| `db/blog.db.js` | like, comment, report SQL; admin reported and comment lists |
| `services/blogInteraction.service.js` | like, unlike, viewer state, comments, reports |
| `services/adminBlog.service.js` | `reported` list, `dismiss` action, hide resolves reports, comment hide/show |
| `lib/validation/blog.js` | `commentInputSchema`, `reportSchema`, `adminBlogListSchema` + `reported`, `adminBlogActionSchema` + `dismiss` |
| `app/api/blog/posts/[id]/{like,viewer,comments,report}/route.js`, `app/api/blog/comments/[id]/route.js` | learner routes |
| `app/api/admin/blog/comments/route.js`, `app/api/admin/blog/comments/[id]/route.js` | admin comment moderation |
| `components/blog/postCard.jsx` | like and comment counts in `PostMeta` |
| `components/blog/postActions.jsx` | client island: like button, counts, report dialog |
| `components/blog/postComments.jsx` | client island: comment list, form, delete |
| `components/admin/blog/blogQueue.jsx` | Reported tab with Dismiss; Comments tab |
| `clients/blog.client.js`, `keys/blog.keys.js`, `queries/blog.query.js`, `mutations/blog.mutation.js` | data layer |

---

### Task 1: Schema

**Files:**
- Create: `db/migrations/20261109_022_blog_interactions.sql`
- Test: `__tests__/blog/blogInteractionSchema.integration.test.js`

**Interfaces (produces):**
- `community.post_like`:
  - `post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE`
  - `user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `PRIMARY KEY (post_id, user_id)`
  - index `(user_id)`
- `community.post_comment`:
  - `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
  - `public_id varchar(40) UNIQUE NOT NULL`
  - `post_id` (FK cascade), `user_id` (FK cascade)
  - `body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000)`
  - `is_hidden boolean NOT NULL DEFAULT false`, `is_deleted boolean NOT NULL DEFAULT false`
  - `hidden_reason text`
  - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
  - index `(post_id, created_at DESC, id DESC) WHERE NOT is_deleted`
  - index `(created_at DESC, id DESC) WHERE NOT is_deleted`, for the admin list
- `community.post_report`:
  - `post_id` (FK cascade), `reporter_id` (FK cascade to `identity.users`)
  - `reason varchar(500) NOT NULL CHECK (char_length(reason) >= 5)`
  - `created_at timestamptz NOT NULL DEFAULT now()`, `resolved_at timestamptz`
  - `UNIQUE (post_id, reporter_id)`
  - index `(post_id) WHERE resolved_at IS NULL`

Same migration style as `20261109_021_community_blog.sql`. Do not edit `db/schema.sql` and do not run `db:compare` (P1 Ruling D).

- [ ] **Step 1: Write the failing test.** Follow `__tests__/blog/blogSchema.integration.test.js`: TAG users, a published post, cleanup.
  - `"one like per user"`: a second insert into `post_like` with the same pair throws 23505.
  - `"comment body limits"`: an empty body and a 2001-character body throw 23514.
  - `"one report per user"`: a second report by the same user throws 23505.
  - `"deleting the post cascades"`: likes, comments and reports are gone after `DELETE FROM community.post`.
- [ ] **Step 2: Run** `npx vitest run __tests__/blog/blogInteractionSchema.integration.test.js`. Expected: FAIL (relation does not exist).
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** `npm run db:migrate`, then the test. Expected: the migration applies and the test passes.
- [ ] **Step 5: Commit** `feat(blog): post_like, post_comment and post_report tables`

---

### Task 2: Likes and viewer state

**Files:**
- Create: `services/blogInteraction.service.js`, `app/api/blog/posts/[id]/like/route.js`, `app/api/blog/posts/[id]/viewer/route.js`
- Modify: `db/blog.db.js`; `services/blog.service.js` (`publicPost` adds `likeCount`, `commentCount`; `listPublished` and `getPublishedBySlug` select `like_count` and `comment_count`)
- Test: `__tests__/blog/blogLikes.integration.test.js`

**Interfaces:**
- Consumes:
  - `userDb.isEmailVerified({ userId })`
  - `withTransaction`
  - `blogDb.userByPublicId(client, publicId)`
  - `apiRoute`, `rateLimiters.vote`
  - the P1 post id regex `/^pst_[0-9a-z]{26}$/`
- Produces, in `blogInteractionService`:
  - `like({ userId, postId }) → { liked: true, likeCount }`. Idempotent: `INSERT … ON CONFLICT DO NOTHING`; the counter goes up only when a row was inserted.
  - `unlike({ userId, postId }) → { liked: false, likeCount }`. The counter goes down only when a row was deleted, and never below 0.
  - `viewer({ userId, postId }) → { likeCount, commentCount, liked, reported, own }`. `userId` may be null (signed out), which gives `liked`, `reported` and `own` all `false`.
- Locking: lock the post row (`SELECT … FOR UPDATE` on `status='published' AND deleted_at IS NULL`) before changing the counter, so concurrent likes serialize.
- Routes:
  - `POST`/`DELETE /api/blog/posts/[id]/like`: `csrf: true`, `limiter: rateLimiters.vote`.
  - `GET /api/blog/posts/[id]/viewer`: `auth: "optional"`, default `private, no-store`.
- Cache: like changes do NOT revalidate the blog cache. The list and post-page counts may lag by up to the page cache life; the island shows live counts.

- [ ] **Step 1: Write the failing tests:**
  - `"like twice counts once"`: two `like` calls give `likeCount` 1, and there is one row.
  - `"unlike without a like changes nothing"`: `likeCount` stays 0.
  - `"cannot like own post"`: rejects `{ status: 400, message: "You cannot like your own post" }`.
  - `"unverified cannot like"`: rejects with status 403 and the P1 message.
  - `"hidden post is 404"`: set the post to `hidden` in SQL; `like` rejects `{ status: 404 }`.
  - `"viewer state"`: signed out gives `liked: false, own: false`. After a like, `liked: true`. For the author, `own: true`.
  - `"public reads carry counts"`: `getPublishedBySlug` returns `likeCount` 1 and `commentCount` 0.
- [ ] **Step 2: Run** `npx vitest run __tests__/blog/blogLikes.integration.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the db functions, the service, `publicPost` and the routes.
- [ ] **Step 4: Run** that test, then `npx vitest run __tests__/blog`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(blog): likes with counters and viewer state`

---

### Task 3: Comments

**Files:**
- Create: `app/api/blog/posts/[id]/comments/route.js` (GET, POST), `app/api/blog/comments/[id]/route.js` (DELETE), `app/api/admin/blog/comments/route.js` (GET), `app/api/admin/blog/comments/[id]/route.js` (PATCH)
- Modify: `db/blog.db.js`, `services/blogInteraction.service.js`, `services/adminBlog.service.js`, `lib/validation/blog.js`
- Test: `__tests__/blog/blogComments.integration.test.js`

**Interfaces (produces):**
- `commentInputSchema = z.object({ body: z.string().trim().min(1, "Write a comment").max(2000) })`
- `blogInteractionService.listComments({ userId, postId, cursor })` → `{ items: [{ id, body, createdAt, author: { id, username, image }, own }], nextCursor }`:
  - Newest first, 20 per page, keyset on `(created_at, id)` with `lib/keysetCursor.js`.
  - Excludes hidden and deleted comments.
  - The post must be published (404 otherwise).
- `blogInteractionService.addComment({ userId, postId, input })` → the new comment in the same shape as a list item.
- `blogInteractionService.deleteComment({ userId, commentId })` → `{ deleted: true }`:
  - Only the comment's author may delete it; anyone else gets 404.
  - Sets `is_deleted`. The counter goes down only if the comment was visible.
- `adminBlogService.listComments({ cursor })` → `{ items: [{ id, body, createdAt, hidden, author, post: { id, slug, title } }], nextCursor }`. Newest first, excluding deleted comments.
- `adminBlogService.setCommentHidden({ actor, commentId, hidden, reason, ip })` → `{ changed }`:
  - Audit actions are `blog.comment_hide` and `blog.comment_show`.
  - The counter moves only on a change of visibility. A deleted comment answers 404.
  - Hiding notifies the commenter through `notificationService.notify` with `kind: "content_hidden"`, title "Comment hidden", the reason in the message, and `dedupeKey` `blog-comment:<id>:hide:<updated_at ISO>`.
- Routes:
  - `GET` comments: `auth: "optional"`, `limiter: rateLimiters.commentRead`.
  - `POST` comments: `csrf`, `limiter: rateLimiters.comment`, returns status 201.
  - `DELETE`: `csrf`, `limiter: rateLimiters.comment`.
  - Admin `GET`: `requirePermission(["admin.read","blog.moderate"])`.
  - Admin `PATCH`: `requirePermission(["blog.moderate"])` with `csrf`, `rateLimiters.admin`, and `adminCommentHideSchema` from `lib/validation/admin.js`.
  - The comment id regex is `/^pcm_[0-9a-z]{26}$/`.

- [ ] **Step 1: Write the failing tests:**
  - `"comment and count"`: `addComment` gives `commentCount` 1, and the item has `own: true` for its author.
  - `"blank comment rejected"`: the schema rejects `"   "`.
  - `"only the author deletes"`: another user gets `{ status: 404 }`. The author deletes it, and `commentCount` goes back to 0.
  - `"hide then delete counts once"`: an admin hides it (count 0), then the author deletes it (count still 0). `setCommentHidden(false)` on the deleted comment rejects `{ status: 404 }`.
  - `"hidden comments are not listed"` and `"hidden post blocks comments"` (404).
  - `"admin list"` shows the post title, and audit rows `blog.comment_hide` exist.
- [ ] **Step 2: Run** `npx vitest run __tests__/blog/blogComments.integration.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npx vitest run __tests__/blog`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(blog): comments with counters, author delete and admin hide`

---

### Task 4: Reports and the Reported queue

**Files:**
- Create: `app/api/blog/posts/[id]/report/route.js`
- Modify: `db/blog.db.js`, `services/blogInteraction.service.js`, `services/adminBlog.service.js`, `lib/validation/blog.js`
- Test: `__tests__/blog/blogReports.integration.test.js`

**Interfaces (produces):**
- `reportSchema = z.object({ reason: z.string().trim().min(5).max(500) })`
- `blogInteractionService.report({ userId, postId, input })` → `{ reported: true }`. Answers 409 "You already reported this post" on a duplicate, and 400 for the user's own post.
- `adminBlogListSchema.status` gains `"reported"`:
  - It lists published posts with at least one unresolved report, most reports first, then the newest report first.
  - Each item adds `reportCount` and `reports: [{ reason, createdAt }]`, with up to 5 of the newest unresolved reports.
  - Use the existing `pageOf` keyset. Order by `(report_count DESC, last_report_at DESC, id DESC)`. The cursor carries `last_report_at` and the post public id. Report counts change between pages, so accept that rows can move between pages (a `shortcut:` comment documents this).
- `adminBlogActionSchema.action` gains `"dismiss"`:
  - It is allowed only on `published` posts that have unresolved reports. It resolves all of them and leaves the post published. Audit action is `blog.dismiss`. No author notice.
- The P1 `hide` action now also sets `resolved_at = now()` on the post's unresolved reports, in the same transaction.
- Route: `POST /api/blog/posts/[id]/report` with `csrf`, `limiter: rateLimiters.feedback`, returns status 201.

- [ ] **Step 1: Write the failing tests:**
  - `"report once"`: the second report gives `{ status: 409 }`.
  - `"cannot report own post"`: `{ status: 400 }`.
  - `"reported queue order"`: post A has 2 reports and post B has 1. The list is `[A, B]`, `A.reportCount` is 2, and `A.reports` holds both reasons.
  - `"dismiss resolves"`: after `act({ action: "dismiss" })`, A is gone from `reported` and is still published.
  - `"hide resolves reports"`: hiding B removes it from `reported`.
  - `"dismiss without reports"`: `{ status: 409 }`.
- [ ] **Step 2: Run** `npx vitest run __tests__/blog/blogReports.integration.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npx vitest run __tests__/blog`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(blog): reports, Reported queue and dismiss`

---

### Task 5: Counts on the list, like and report on the post page

**Files:**
- Modify: `components/blog/postCard.jsx` (`PostMeta` shows counts), `components/blog/postPage.jsx`, `clients/blog.client.js`, `keys/blog.keys.js`, `queries/blog.query.js`, `mutations/blog.mutation.js`
- Create: `components/blog/postActions.jsx` (`"use client"`)

**Interfaces:**
- Consumes the routes from Tasks 2 and 4. The post page passes `post.id`, `post.slug`, and the cached `post.likeCount` / `post.commentCount` as initial values.
- `PostMeta`:
  - Append `LuHeart` + count and `LuMessageCircle` + count, each wrapped in a `<span>` with `aria-label="N likes"` / `"N comments"`, `whitespace-nowrap` and `tabular-nums`.
  - Hide a count when it is 0, so a new post's row stays clean.
- `postActions.jsx`, placed between the body and the author box:
  - A row with these controls:
    - Like: a `Button variant="outline"` with `aria-pressed={liked}`. When liked, the heart is filled (`LuHeart` plus `fill-current text-primary`). The like count sits inside the button.
    - Comments: a link to `#comments` showing the count.
    - Report: a `Button variant="ghost"` with `LuFlag`, on the right.
  - Hide Report for the post's own author (`own`).
  - Data:
    - Load the viewer state from `GET …/viewer` with React Query; the counts render from the initial values until it arrives.
    - Like and unlike are optimistic: flip the state and adjust the count, and roll back on error with `useApp().showAlert`.
  - Signed out (no session from `useSession()`): Like and Report navigate to `/auth?next=/blog/<slug>`.
  - Report opens the house `ConfirmDialog` (or `Dialog` if `ConfirmDialog` cannot take a reason field):
    - a reason textarea, 5–500 characters, with a counter;
    - submit says "Report post";
    - after success, Report turns into a disabled "Reported" button;
    - a 409 also shows the "Reported" state.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** with `npx vitest run __tests__/blog`, eslint on the changed files, and `npm run build`. List what you could not check without a browser (the controller checks it).
- [ ] **Step 3: Commit** `feat(blog): like and comment counts, like button and report dialog`

---

### Task 6: Comment section

**Files:**
- Create: `components/blog/postComments.jsx` (`"use client"`)
- Modify: `components/blog/postPage.jsx` (`<section id="comments">` after the author box, before "More about"), and the data layer files
- Test: `__tests__/blog/postComments.test.jsx` (render test)

**Interfaces:**
- Consumes the comment routes from Task 3 and `blogKeys`.
- Heading: `<h2>` "Comments" with the count.
- Form:
  - Signed in: a `Textarea` (house `components/shadcn/textarea`) with a `{n}/2000` counter and a "Post comment" button, disabled while the body is blank or a post is pending.
  - On success, prepend the comment and clear the field.
  - Signed out: the text "Sign in to join the discussion" and a link to `/auth?next=/blog/<slug>#comments`.
- Each comment shows:
  - `AuthorAvatar`, the username linked to the author's profile, and a `<time>` with a relative date.
  - The body as plain text with `whitespace-pre-wrap break-words`. It is never Markdown and never `dangerouslySetInnerHTML`.
  - A Delete button only on `own`, behind `ConfirmDialog` ("Delete comment").
- Lists:
  - "Load more" uses `useInfiniteQuery`, as in `components/blog/loadMore.jsx`.
  - Empty state: "No comments yet. Be the first to share what you think."
- Comment text style: `text-[0.9375rem] leading-relaxed`, matching the reading column.

- [ ] **Step 1: Write the failing render test.** Render `CommentItem` (export it) with body `"**bold** <img src=x onerror=alert(1)>\nline 2"`:
  - the output contains the literal text `**bold**`;
  - it contains no `<img` element;
  - it contains no `<strong>`;
  - it keeps the newline inside a `whitespace-pre-wrap` element.
- [ ] **Step 2: Run** `npx vitest run __tests__/blog/postComments.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, eslint and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(blog): comment section on the post page`

---

### Task 7: Admin Reported and Comments tabs

**Files:**
- Modify: `components/admin/blog/blogQueue.jsx`, `clients/premium.client.js` (`adminClient.listBlogComments`, `setBlogCommentHidden`), `keys/admin.keys.js`, `mutations/premium.mutation.js`

**Interfaces:**
- Tabs: Pending / Appeals / **Reported** / Hidden / Rejected / Published / **Comments**.
- Reported rows:
  - Show "N reports" (`Badge variant="warning"`) and the reasons as a short list.
  - Actions: Hide (existing reason dialog) and "Dismiss reports" (`ConfirmDialog`, no reason).
- Comments rows:
  - Show the body (plain text, clamped to 3 lines), the author, a link to the post (`/blog/<slug>#comments`), and the date.
  - Actions: Hide (reason dialog) or Show.
- Follow `components/admin/feedback/commentList.jsx` for the comment row and the hide flow.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** with eslint and `npm run build`.
- [ ] **Step 3: Commit** `feat(blog): admin Reported and Comments tabs`

---

### Task 8: Verification (controller)

- [ ] **Step 1: Run** `npm run lint`, `npm test` and `npm run build`. Expected: everything passes, except the lint error in `components/settings/webPushSection.jsx` that predates this branch.
- [ ] **Step 2: Browser** (`next start`, local QA learner plus a second QA learner):
  1. On the list, counts appear only when they are not 0.
  2. Like, unlike and reload show the right state and count; liking your own post shows no Report button and gives a 400 on like.
  3. Signed out, Like goes to `/auth?next=…`.
  4. Comment, see it at the top, delete it, and see the count drop.
  5. Report a post; the second attempt shows "Reported".
  6. Check at 375 px and in dark mode.
- [ ] **Step 3: Admin tabs.** These need MFA, so this step goes to the user (P1 Ruling T).
