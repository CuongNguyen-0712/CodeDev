# Community Blog P3 (Rewards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Pay authors at fixed milestones: 20 EXP the first time a post is published, and 10/30/60 points when a post reaches 10/50/100 likes.

**Architecture:** Rewards run inside the transaction that already changes the post (publish in `blogService` write, `adminBlogService.act`, like in `blogInteractionService`), through the existing ledger functions `public.award_exp` and `public.post_points`. Both are idempotent per source. Notifications go out after commit through `notificationService.notifyRewards`. One migration adds the EXP rule and widens the EXP `source_type` CHECK.

**Tech Stack:** PostgreSQL (plpgsql ledger functions already in the DB), Next.js 16 services, Vitest (unit + `describe.skipIf(!hasDb)` integration).

**Spec:** `docs/superpowers/specs/2026-11-09-community-blog-design.md`, section "Thưởng (P3)" (lines 153–175) and "Kiểm thử → P3".

## Global Constraints

- Milestone table (verbatim): publish → 20 EXP; 10 likes → 10 points; 50 likes → 30 points; 100 likes → 60 points. Max per post: 20 EXP, 100 points.
- `BLOG_LIKE_MILESTONES = [{ likes: 10, points: 10 }, { likes: 50, points: 30 }, { likes: 100, points: 60 }]`.
- EXP rule key `blog.post_published`, amount 20; EXP `source_type` `'blog_post'`, `source_id` = `community.post.id`.
- Points idempotency key `blog-likes:<post public id>:<likes>`.
- At most one post earns publish EXP per author per day. Hiding a post never takes EXP or points back.
- New migration file only; `db/schema.sql` is not edited (P1 Ruling D).
- Lock order stays **post row first, then `profile.info`** (both ledger functions lock `profile.info FOR UPDATE`).
- User-visible copy in English, like the rest of the blog.

## Decisions this plan makes (spec is silent or conflicts)

- **D1. Points `source_type` per milestone.** `public.post_points` also dedupes on `(user, source_type, source_id, action)` (`uq_point_transaction_source`). One `source_type` for all three milestones would silently drop the 50 and 100 credits. Use `source_type = 'blog_likes_<likes>'` (`blog_likes_10`, `blog_likes_50`, `blog_likes_100`), `source_id` = post db id, plus the spec's idempotency key.
- **D2. "Per day" = rolling 24 hours.** No EXP when the author already has a `blog_post` EXP row with `created_at > now() - interval '24 hours'`. No time-zone setting needed. The check runs after locking the author's `profile.info` row, so two concurrent publishes cannot both pass.
- **D3. EXP is attempted only when a post enters `published`** (create/update where the old status was not `published`; admin `approve`, appeal approve, `show`). A post skipped by the daily cap gets no EXP on later edits. It can still get EXP if it is hidden and later shown on another day. That is accepted: the cap and the 20-per-post maximum both still hold.
- **D5. Toast only for the author's own publish** (user request, 2026-11-10). The editor calls the existing `announceRewards` from `components/ui/level.jsx` with the `rewards` the write returns. Admin approval and like milestones reach the author as notifications only: the author is not the one acting, and the realtime bridge only refreshes the inbox on `NOTIFICATION_CREATED`.
- **D4. A reward error rolls back the write it rides on.** Every real user has a `profile.info` row (the sign-up functions such as `public.sign_in_with_provider` insert it together with the user), so the ledger's `CD404` cannot happen outside tests. Test fixtures get a `profile.info` row instead of the code getting a guard.

## Review Focus

1. Unlike then like again at exactly 10 likes → no second credit; balance stays 10. (Task 3 test)
2. `like_count` set to 49, one like → 30 points under `blog_likes_50`, and the 10-likes credit already present is not blocked by it. (Task 3 test)
3. Trusted author publishes two posts within 24 hours → only the first gets 20 EXP; editing the first again adds nothing. (Task 2 test)
4. Admin hides a rewarded post → EXP and points rows stay; `show` adds no second EXP row. (Task 2 test)
5. Purged post → EXP ledger still lists the row, titled "Blog post published" (LEFT JOIN gives a null title). (Task 4 test)

---

### Task 1: Migration and milestone helper

**Files:**
- Create: `db/migrations/20261110_023_blog_rewards.sql`
- Create: `lib/blog/rewards.mjs`
- Test: `__tests__/blog/blogRewards.test.js`
- Modify: `__tests__/blog/blogInteractionSchema.integration.test.js` (add the schema assertions below)

**Interfaces:**
- Produces: `BLOG_LIKE_MILESTONES` (array above), `BLOG_PUBLISH_EXP_RULE = "blog.post_published"`, `milestoneAt(likeCount: number) -> { likes, points } | null` (exact match only), all from `lib/blog/rewards.mjs`.

- [x] **Step 1: Write the failing unit test** `__tests__/blog/blogRewards.test.js`:
  - `milestoneAt(9)` → `null`; `milestoneAt(10)` → `{ likes: 10, points: 10 }`; `milestoneAt(11)` → `null`; `milestoneAt(50)` → `{ likes: 50, points: 30 }`; `milestoneAt(100)` → `{ likes: 100, points: 60 }`; `milestoneAt(150)` → `null`.
  - The sum of `points` in `BLOG_LIKE_MILESTONES` is `100`.
- [x] **Step 2:** `npx vitest run __tests__/blog/blogRewards.test.js` → FAIL (module not found).
- [x] **Step 3: Implement `lib/blog/rewards.mjs`.**
- [x] **Step 4: Write the migration**, in the header-comment and `BEGIN/COMMIT` style of `20261024_005_achievements.sql`:
  - `INSERT INTO profile.exp_rule (rule_key, amount, is_active) VALUES ('blog.post_published', 20, true) ON CONFLICT (rule_key) DO NOTHING;`
  - Drop and re-add `exp_transaction_source_type_check` with `('lesson', 'challenge', 'course', 'achievement', 'adjustment', 'blog_post')`.
  - Header comment states D1 (points use `blog_likes_<n>` because of `uq_point_transaction_source`).
- [x] **Step 5: Add schema assertions** to `blogInteractionSchema.integration.test.js`: rule `blog.post_published` exists with amount 20 and `is_active`; an `INSERT` into `profile.exp_transaction` with `source_type = 'blog_post'` is accepted by the CHECK (inside a rolled-back transaction or a savepoint, like the file's existing checks).
- [x] **Step 6:** `npm run db:migrate`, then `npx vitest run __tests__/blog/blogRewards.test.js __tests__/blog/blogInteractionSchema.integration.test.js` → PASS.
- [x] **Step 7: Commit** `feat(blog): reward rule, EXP source type and like milestones`.

### Task 2: EXP when a post is first published

**Files:**
- Modify: `db/blog.db.js` (add `awardPublishExp`; add `p.author_id::text AS author_id, p.title` to `lockForModeration`)
- Modify: `services/blog.service.js` (`write`)
- Modify: `services/adminBlog.service.js` (`act`)
- Test: create `__tests__/blog/blogRewards.integration.test.js`
- Modify fixtures: every `newUser` helper in `__tests__/blog/*.integration.test.js` whose posts reach `published` through `blogService` or `adminBlogService.act` also inserts `profile.info (user_id, surname, name)`. At least `blogService`, `adminBlog`, `blogLikes`. Run the whole `__tests__/blog` folder to find the rest.

**Interfaces:**
- Consumes: `BLOG_PUBLISH_EXP_RULE` (Task 1).
- Produces: `blogDb.awardPublishExp(client, { authorDbId: string, postDbId: string }) -> { awarded: number, level: number, previousLevel: number } | null`. It locks `profile.info` of the author `FOR UPDATE`, returns `null` when a `blog_post` EXP row exists in the last 24 hours (D2), else calls `public.award_exp($1, 'blog.post_published', 'blog_post', $2)` and maps `awarded`, `new_level`, `previous_level`.

- [x] **Step 1: Write failing integration tests** in `blogRewards.integration.test.js`. Use the `newUser`/`TAG`/cleanup pattern of `blogLikes.integration.test.js` plus a `profile.info` row. Helper `expRows(postPublicId)` counts `profile.exp_transaction` rows with `source_type = 'blog_post'` for that post.
  - `trusted author's publish earns 20 EXP once`: mark the author trusted (one post with `approved_at`), create a post with `submit: true` → one row, amount 20; `profile.info.exp` up by 20. `update` the same post again → still one row.
  - `second publish within 24 hours earns nothing`: second post → 0 rows.
  - `draft earns nothing`: `submit: false` → 0 rows.
  - `admin approve pays the first post`: a new author's pending post, `adminBlogService.act(..., "approve")` → one row of 20.
  - `hide keeps EXP and show does not pay twice`: approve, `hide`, `show` → still one row; `profile.info.exp` unchanged by hide.
- [x] **Step 2:** `npx vitest run __tests__/blog/blogRewards.integration.test.js` → FAIL (0 rows).
- [x] **Step 3: Implement `awardPublishExp`** in `db/blog.db.js`.
- [x] **Step 4: Wire `write`.** Inside the transaction, when `status === "published" && current?.status !== "published"`, call `awardPublishExp` with the author's db id and the post's db id. Return the result out of the transaction. After commit, when it is non-null, call `notificationService.notifyRewards(userId, { level, previousLevel })`. The service response gains `rewards: { awardedExp, level, previousLevel }` only when EXP was awarded; otherwise it stays `{ id, slug, status }`. Add a test assertion: the trusted publish returns `rewards.awardedExp === 20`, and the update returns no `rewards`.
- [x] **Step 5: Wire `act`.** Inside the transaction, when `to === "published"`, call `awardPublishExp({ authorDbId: post.author_id, postDbId: post.id })`. After commit, `notifyRewards(post.author_public_id, …)` next to the existing `notify` call.
- [x] **Step 6: Add `profile.info` to the fixtures** listed under Files.
- [x] **Step 7:** `npx vitest run __tests__/blog` → all PASS.
- [x] **Step 8: Commit** `feat(blog): 20 EXP when a post is first published`.

### Task 3: Points at 10/50/100 likes

**Files:**
- Modify: `db/blog.db.js` (add `awardLikeMilestone`; `lockLive` also returns `public_id`, `slug`, `title`)
- Modify: `services/blogInteraction.service.js` (`setLiked`)
- Modify: `services/notification.service.js` (`notifyRewards` handles `milestones`)
- Test: `__tests__/blog/blogRewards.integration.test.js` (extend)

**Interfaces:**
- Consumes: `milestoneAt` (Task 1).
- Produces:
  - `blogDb.awardLikeMilestone(client, { authorDbId, postDbId, postPublicId, title, likes, points }) -> boolean` (the `created` flag). It calls `public.post_points(author, 'credit', 'earned', points, 'blog_likes_' || likes, postDbId, 'blog-likes:' || postPublicId || ':' || likes, NULL, NULL, '<likes> likes on "<title>"')`.
  - `notifyRewards(userId, { level, previousLevel, achievements, milestones })`. Each `milestones` item is `{ likes, points, slug, postId }` and sends `notify(userId, { kind: "reward", title: "Your post reached <likes> likes", message: "+<points> points", link: "/blog/<slug>", dedupeKey: "blog-likes:<postId>:<likes>" })`.

- [x] **Step 1: Write failing tests** (verified fans created in a loop; helper `points(user)` reads `profile.info.points`; helper `credits(postId)` lists `source_type` from `profile.point_transaction` with `source_id` = post db id):
  - `10th like pays 10 points once`: 10 fans like → author points +10; credits `['blog_likes_10']`.
  - `unlike and like again at 10 pays nothing more`: fan 10 unlikes then likes → still +10, one credit.
  - `50 and 100 pay their own amounts`: `UPDATE community.post SET like_count = 49`, one new fan likes → +30 under `blog_likes_50`. Set it to 99, one more fan → +60 under `blog_likes_100`. Credits hold all three.
  - `9 likes pay nothing`.
  - `milestone notifies the author`: after the 10th like, `profile.notification` has a row of kind `reward` for the author with dedupe key `blog-likes:<post public id>:10`.
- [x] **Step 2:** run → FAIL.
- [x] **Step 3: Implement.** In `setLiked`, only when `liked && changed`: `const m = milestoneAt(likeCount)`. When `m` is set, call `awardLikeMilestone` and keep `{ ...m, slug, postId }` when it returns `true`. After the transaction, `notifyRewards(authorPublicId, { milestones: [milestone] })`. `lockLive` or one more select supplies the author public id. The route response stays `{ liked, likeCount }`.
- [x] **Step 4:** `npx vitest run __tests__/blog` → PASS.
- [x] **Step 5: Commit** `feat(blog): points when a post reaches 10, 50 and 100 likes`.

### Task 4: Ledger labels

**Files:**
- Modify: `db/experience.db.js` (ledger query: `LEFT JOIN community.post bp ON t.source_type = 'blog_post' AND bp.id = t.source_id`, add `bp.title` to the `COALESCE`)
- Modify: `components/profile/experienceSection.jsx` (`SOURCES.blog_post = { icon: LuPenLine, label: "Blog post published" }`)
- Modify: `components/commerce/ordersPage.jsx` (earned row: `blog_likes_<n>` reads "Earned from blog likes"; the reason line already shows `<n> likes on "<title>"`)
- Test: `__tests__/blog/blogRewards.integration.test.js`

This is a small change to existing positions: a map entry and a label next to their neighbours. Follow `ui-consistency:adjusting` → `verifying` at the size of the change.

- [x] **Step 1: Failing test:** `experienceService` ledger for the author lists the publish row with `source: "blog_post"` and `sourceTitle` = the post title. After `DELETE FROM community.post` it is still listed, with `sourceTitle` `null`.
- [x] **Step 2:** run → FAIL (`sourceTitle` null while the post exists).
- [x] **Step 3: Implement the three edits.** In `ordersPage.jsx`, strip a trailing `_<digits>` from `tx.source` before `humanize`.
- [x] **Step 4:** `npx vitest run __tests__/blog`, then `npm test` and `npm run build` → PASS.
- [x] **Step 5: Commit** `feat(blog): blog rewards in the EXP and points history`.

### Task 5: Reward toast in the editor

**Files:**
- Modify: `components/blog/postEditor.jsx` (`save` → the `onSuccess` of `create` and `update`)
- Test: `__tests__/blog/postEditorRewards.test.jsx` (new; mock `@/components/ui/level`, the mutations and the router the way `__tests__/blog/feedActions.test.jsx` mocks its hooks)

**Interfaces:**
- Consumes: `rewards` in the write response (Task 2); `announceRewards(rewards, { title, id })` from `components/ui/level.jsx`. It toasts "Post published · +20 EXP", bumps the rewards store and opens the level-up dialog on a new level.

This is a small change to one page: follow `ui-consistency:adjusting` → `implementing` → `verifying`. The reference is how `components/learning/[id]/lessons.jsx` announces a lesson reward.

- [x] **Step 1: Failing test:**
  - `announces EXP when the publish paid`: create resolves with `{ id, slug, status: "published", rewards: { awardedExp: 20, level: 2, previousLevel: 1 } }`. `announceRewards` is called once with those `rewards` and `{ title: "Post published", id: "blog-published:<id>" }`. `showAlert` is not called with a success.
  - `keeps the plain alert without rewards`: create resolves without `rewards`. `announceRewards` is not called, and `showAlert(200, "Post submitted")` is.
  - The same pair for `update`, on a draft submitted by a trusted author.
- [x] **Step 2:** `npx vitest run __tests__/blog/postEditorRewards.test.jsx` → FAIL.
- [x] **Step 3: Implement.** In both `onSuccess` handlers: `if (saved?.rewards) announceRewards(saved.rewards, { title: "Post published", id: \`blog-published:${saved.id}\` }); else showAlert(…existing copy…)`. Navigation stays as it is. `update.mutate` must hand the response to `onSuccess`; check `mutations/blog.mutation.js` returns it.
- [x] **Step 4:** `npx vitest run __tests__/blog`, then `npm test` and `npm run build` → PASS.
- [x] **Step 5: Commit** `feat(blog): reward toast when a post is published`.
