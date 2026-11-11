# Course Rating Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learners rate a course at 20%, 50% and 100% progress (up to three ratings), the public average counts each learner's latest milestone rating, and the course page shows a per-milestone breakdown without moving the stars on click.

**Architecture:** One new column `milestone` on `community.course_rating` (primary key `(user_id, course_id, milestone)`), the existing trigger recounts from the latest visible row per learner, so every reader of `catalog.course.rating*` stays unchanged. Milestone rules are pure functions in `lib/ratingRules.js`; the server always picks the milestone; the client keeps the v1 optimistic `useCourseRate`.

**Tech Stack:** Next.js 16 (server actions), TanStack Query 5.104, PostgreSQL (plain SQL, `db/migrations` + `npm run db:migrate`), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-10-course-rating-section-design.md` (v2). Read rules 1-14 before any task.

## Global Constraints

- Milestones are exactly `[20, 50, 100]`; progress = completed visible lessons / visible lessons (same filter as `public.submit_lesson`: `l.is_deleted = false AND l.is_hidden = false AND m.is_deleted = false AND m.is_hidden = false`).
- `MIN_RATINGS = 3` for the main average and for each breakdown entry; keep `lib/ratingRules.js` and the trigger in step.
- The client never sends a milestone; `rateCourseAction({ courseId, stars })` keeps its signature.
- Error code for a refused rating stays `RATING_NOT_ALLOWED` (403); limiter stays `rateLimiters.vote`.
- `public.submit_lesson` is not changed.
- UI copy is English, sentence case, matching the existing course page.
- Comments in code are English, one line, the why only.

## Review Focus

1. **A hidden learner rates at a new milestone** → the new row must be hidden too, or moderation is escaped. Test in Task 3 (`upsert` copies `is_hidden`) and Task 1 (trigger).
2. **Progress drops after a rating** (lessons added: learner rated at 50%, now at 40%) → the current milestone stays 50, the next save updates the 50% row, never the 20% one. Test in Task 2 (`currentMilestone`) and Task 3 (`rate`).
3. **A course with 0 visible lessons** → `milestoneFor(0, 0)` returns `null`, no division, learner not eligible (`reason: 'progress'`). Test in Task 2.
4. **A small course jumps a milestone in one lesson** (2 lessons: 0% → 50%) → the prompt asks for 50, the 20% slot stays empty and locked. Test in Task 3 (`ratePromptFor`).
5. **The milestone moved while the page was open** (lesson finished in another tab) → the server writes the new current milestone and its answer replaces the optimistic state (`milestone`, `history`). Test in Task 5 (mutation `onSuccess` writes the server state).

---

### Task 1: Migration — milestone column, backfill, latest-per-learner trigger

**Files:**
- Create: `db/migrations/20261110_024_course_rating_milestones.sql`
- Regenerate (do not hand-edit): `db/functions/community.course_rating_refresh.sql`, `db/triggers/community.course_rating.trg_course_rating_refresh.sql`, `db/schema.sql`, `db/schema.dbml` via `npm run db:export`
- Modify: `db/course.db.js:514`, `db/adminFeedback.db.js:36` — the `(SELECT r.stars FROM community.course_rating r WHERE … AND NOT r.is_hidden)` subqueries return several rows once a learner has two milestones; add `ORDER BY r.milestone DESC LIMIT 1` (spec rule 13)
- Test: `__tests__/admin/adminRating.integration.test.js` (add a case; it runs only with `DATABASE_URL`)

**Interfaces:**
- Produces: `community.course_rating(user_id, course_id, milestone smallint CHECK IN (20,50,100), stars, is_hidden, created_at, updated_at)`, PK `(user_id, course_id, milestone)`, index `idx_course_rating_latest ON (course_id, user_id, milestone DESC) WHERE NOT is_hidden`. Trigger keeps writing `catalog.course.rating_avg`, `rating_count`, `rating` (NULL below 3), `reviews`.

- [ ] **Step 1: Write the failing integration test** in `adminRating.integration.test.js`, reusing its user/course setup:

```js
it("counts each learner once, with their latest milestone", async () => {
    // learner A: 20% -> 2 stars, 50% -> 5 stars; learner B: 20% -> 4 stars
    await sql(`INSERT INTO community.course_rating (user_id, course_id, milestone, stars) VALUES ($1,$3,20,2),($1,$3,50,5),($2,$3,20,4)`, [a, b, courseDbId]);
    const c = (await sql(`SELECT rating_avg::float AS avg, rating_count AS n FROM catalog.course WHERE id = $1`, [courseDbId])).rows[0];
    expect(c).toEqual({ avg: 4.5, n: 2 });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run __tests__/admin/adminRating.integration.test.js`
Expected: FAIL (column `milestone` does not exist).

- [ ] **Step 3: Write the migration** (header in the style of `20261110_023_blog_rewards.sql`, inside `BEGIN; … COMMIT;`):
  1. `ADD COLUMN milestone smallint NOT NULL DEFAULT 20 CHECK (milestone IN (20, 50, 100))`;
  2. backfill each row to the learner's milestone by progress (rule 14):

```sql
UPDATE community.course_rating r SET milestone = CASE
    WHEN p.total > 0 AND p.done * 100 >= p.total * 100 THEN 100
    WHEN p.total > 0 AND p.done * 100 >= p.total * 50  THEN 50
    ELSE 20 END
FROM (SELECT r2.user_id, r2.course_id,
             COUNT(l.id) AS total,
             COUNT(h.lesson_id) FILTER (WHERE h.status = 'completed') AS done
      FROM community.course_rating r2
      JOIN course.module m ON m.course_id = r2.course_id AND m.is_deleted = false AND m.is_hidden = false
      JOIN course.lesson l ON l.module_id = m.id AND l.is_deleted = false AND l.is_hidden = false
      LEFT JOIN learning.history h ON h.lesson_id = l.id AND h.user_id = r2.user_id AND h.course_id = r2.course_id
      GROUP BY r2.user_id, r2.course_id) p
WHERE p.user_id = r.user_id AND p.course_id = r.course_id;
```

  3. `ALTER COLUMN milestone DROP DEFAULT`; drop the old PK (`course_rating_pkey`), add `PRIMARY KEY (user_id, course_id, milestone)`; create `idx_course_rating_latest`;
  4. `CREATE OR REPLACE FUNCTION community.course_rating_refresh()` with the same loop as today, the inner `FROM (…) s` replaced by the spec's `DISTINCT ON (user_id) … ORDER BY user_id, milestone DESC` subquery (`WHERE course_id = v_course AND NOT is_hidden`);
  5. recreate `trg_course_rating_refresh` with `UPDATE OF stars, is_hidden, course_id, milestone`;
  6. finish with one recount of every rated course: the function body's `UPDATE catalog.course … FROM (…)` written once as a set-based statement over `course_id IN (SELECT DISTINCT course_id FROM community.course_rating)` (the backfill updated `milestone` before the trigger listened to it, so nothing recounted yet).
  7. in `db/course.db.js` and `db/adminFeedback.db.js` add `ORDER BY r.milestone DESC LIMIT 1` to the author-stars subqueries.

- [ ] **Step 4: Apply and export**

Run: `npm run db:migrate` then `npm run db:export`
Expected: migration `20261110_024` applied; `git diff --stat db/` shows the function, trigger and schema files changed.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run __tests__/admin/adminRating.integration.test.js`
Expected: PASS (or skipped without `DATABASE_URL`; then check by hand with the Step 1 SQL in `psql` and roll it back).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/20261110_024_course_rating_milestones.sql db/functions db/triggers db/schema.sql db/schema.dbml db/course.db.js db/adminFeedback.db.js __tests__/admin/adminRating.integration.test.js
git commit -m "feat(rating): milestone column, latest rating per learner counts"
```

### Task 2: Milestone rules and optimistic state helper

**Files:**
- Modify: `lib/ratingRules.js`
- Test: `__tests__/rating/applyRating.test.js` (extend), `__tests__/rating/milestones.test.js` (create)

**Interfaces:**
- Produces:
  - `MILESTONES: readonly [20, 50, 100]`
  - `MILESTONE_LABEL: { 20: "At 20%", 50: "At 50%", 100: "Finished" }`
  - `milestoneFor(completed: number, total: number): 20 | 50 | 100 | null` — highest `m` with `completed * 100 >= m * total`; `null` when `total <= 0` or below 20%.
  - `currentMilestone(reached: number|null, highestRated: number|null): number|null` — `max` of the two, `null` when both null.
  - `applyRating(state: RatingView, stars: number): RatingView` (shape in Task 3).
- Keeps `RATE_PROMPT_LESSON` for now: `services/courseRating.service.js` still imports it; Task 3 removes both.

- [ ] **Step 1: Write failing tests** in `milestones.test.js`:
  - `milestoneFor`: `(0, 10)→null`, `(1, 10)→null`, `(2, 10)→20`, `(5, 10)→50`, `(9, 10)→50`, `(10, 10)→100`, `(1, 3)→20`, `(1, 2)→50`, `(0, 0)→null`, `(3, 0)→null`.
  - `currentMilestone`: `(20, null)→20`, `(20, 50)→50` (progress dropped), `(null, null)→null`, `(100, 50)→100`.
  
  and in `applyRating.test.js` replace the cases with the v2 shape:
  - first rating ever: `{ average: 4, count: 3, milestone: 20, stars: null, history: [], breakdown: [{ milestone: 20, average: 4, count: 3 }] }` + 2 → `count 4`, `average 3.5`, `stars 2`, breakdown 20 → `{ average: 3.5, count: 4 }`.
  - new milestone with history: `{ average: 4, count: 4, milestone: 50, stars: null, history: [{ milestone: 20, stars: 2 }], breakdown: [] }` + 4 → `count 4` (same learner), `average 4.5` (2 replaced by 4), breakdown gains `{ milestone: 50, average: null, count: 1 }`.
  - change at the current milestone: `stars 5 → 1` with `average 4, count 4` → `average 3`, count unchanged.
  - below threshold: `average: null` stays `null`.
  - `undefined` state returned as is.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run __tests__/rating`
Expected: FAIL (`milestoneFor is not a function`, `applyRating` cases).

- [ ] **Step 3: Implement** the four exports in `lib/ratingRules.js`. `applyRating`: previous = `state.stars ?? state.history.at(-1)?.stars ?? null` (the learner's latest stars in the average); `count + 1` only when previous is null; average recomputed only when non-null, as v1; the breakdown entry for `state.milestone` gets the same treatment with its own previous = `state.stars` (added with `average: null, count: 1` when missing).

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run __tests__/rating`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ratingRules.js __tests__/rating
git commit -m "feat(rating): milestone rules and optimistic state for milestone ratings"
```

### Task 3: Rating state, save and prompt on the server

**Files:**
- Modify: `db/courseRating.db.js`, `services/courseRating.service.js`
- Test: `__tests__/learning/courseRating.test.js`

**Interfaces:**
- Consumes: `milestoneFor`, `currentMilestone`, `MILESTONES`, `MIN_RATINGS` (Task 2).
- Produces:
  - `courseRatingDb.state({ userPublicId, coursePublicId })` → `{ course_id, rating_avg, rating_count, user_id, enrolled, completed, total, ratings: [{ milestone, stars, is_hidden }], breakdown: [{ milestone, avg, count }] } | null` (`ratings` and `breakdown` as `jsonb_agg` subqueries, `'[]'` when empty; breakdown over visible rows only).
  - `courseRatingDb.upsert({ userDbId, courseDbId, milestone, stars })` — conflict `(user_id, course_id, milestone)`; inserts `is_hidden = EXISTS (SELECT 1 … WHERE user_id = $1 AND course_id = $2 AND is_hidden)`.
  - `RatingView` (returned by `courseRatingService.get` / `rate`, read by the client):
    `{ average, count, breakdown: [{ milestone, average /* null below MIN_RATINGS */, count }], milestone, stars, history: [{ milestone, stars }], eligible, reason: 'signin'|'enroll'|'progress'|null }`.
  - `ratePromptFor({ userId, courseId, result })` → `null | { milestone, stars: null }`.

- [ ] **Step 1: Update the tests** (mock rows gain `enrolled, completed, total, ratings, breakdown`):
  - `get` view: learner at 6/10 with `ratings [{20, 4}]` → `milestone 50, stars null, history [{ milestone: 20, stars: 4 }], eligible true, reason null`; breakdown entry with `count 2` → `average null`.
  - reasons: no user → `signin`; not enrolled → `enroll`; enrolled at 1/10 → `progress`; enrolled with `total 0` → `progress`.
  - `rate` at 6/10 → `upsert` called with `{ userDbId: "42", courseDbId: "7", milestone: 50, stars: 5 }`.
  - `rate` after progress drop: 4/10 with `ratings [{50, 3}]` → `upsert` with `milestone: 50`.
  - `rate` at 1/10 → rejects 403 `RATING_NOT_ALLOWED`, no `upsert`.
  - `ratePromptFor`: `awardedPoints 10`, state 2/10 no ratings → `{ milestone: 20, stars: null }`; state 3/10 → `null` (no crossing); state 5/10 with `ratings [{50, 4}]` → `null`; 2-lesson course state 1/2 → `{ milestone: 50, stars: null }`; `awardedPoints 0` → `null`; not enrolled → `null`; db throws → `null`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run __tests__/learning/courseRating.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `state`, `upsert` in `db/courseRating.db.js` (completed/total with the Global Constraints lesson filter) and `view`, `rate`, `ratePromptFor` in the service per spec rules 4, 7-11. `rate` revalidation and Redis delete stay as they are. Remove `RATE_PROMPT_LESSON` from `lib/ratingRules.js` and from the service's import and re-export.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run __tests__/learning/courseRating.test.js __tests__/learning/submitLesson.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/courseRating.db.js services/courseRating.service.js __tests__/learning/courseRating.test.js
git commit -m "feat(rating): server picks the milestone, view with history and breakdown"
```

### Task 4: Admin ratings show milestones, hide a learner

**Files:**
- Modify: `db/adminRating.db.js`, `services/adminRating.service.js`, `components/admin/courses/courseRatings.jsx`
- Test: `__tests__/admin/adminRating.integration.test.js`

**Interfaces:**
- Produces: `items: [{ user_id, username, stars /* latest milestone */, milestones: [{ milestone, stars }], hidden, updated_at }]` — one item per learner. Histogram counts each learner's latest visible stars (so it matches the average). `lock` locks all of the learner's rows and returns the latest.

- [ ] **Step 1: Extend the integration test**: learner with 20%→2 and 50%→5 appears once in `items` with `stars 5` and two `milestones`; hiding them sets `is_hidden` on both rows and `count` drops by one; the audit `before` holds `milestones`.
- [ ] **Step 2: Run** `npx vitest run __tests__/admin/adminRating.integration.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `list` (`GROUP BY` learner, `jsonb_agg(… ORDER BY milestone)`, `bool_or(is_hidden)`, `max(updated_at)`), `summary` stars from the latest row per learner, `lock` with `FOR UPDATE` over all rows, audit `before/after: { user, milestones, hidden }`. In `courseRatings.jsx` the stars cell lists each milestone as `MILESTONE_LABEL[m]` + `LuStar` + stars, latest last, same classes as the current cell.
- [ ] **Step 4: Run** the test — Expected: PASS. Run `npx eslint components/admin/courses db/adminRating.db.js services/adminRating.service.js` — Expected: no output.
- [ ] **Step 5: Commit** `git commit -m "feat(admin): course ratings list milestones per learner"`

### Task 5: Mutation — one request per click

**Files:**
- Modify: `mutations/course.mutation.js` (`useCourseRate`)

**Interfaces:**
- Consumes: `applyRating` v2 (Task 2), `RatingView` (Task 3).

- [ ] **Step 1: Remove** `queryClient.invalidateQueries({ queryKey: courseKeys.details(courseId) })` from `onSuccess`; keep `setQueriesData(rating, state)` behind `isLast(courseId)` (this is what corrects Review Focus 5). Update the comment above the hook to say why there is no details refetch.
- [ ] **Step 2: Verify** in the browser (Task 8): one `rateCourseAction` request per click, no `course-details` / `viewer-state`.
- [ ] **Step 3: Commit** `git commit -m "perf(rating): no course details refetch after a rating"`

### Task 6: Rating section and stars

**Files:**
- Modify: `components/course/params/ratingSection.jsx`, `components/course/ratingStars.jsx`

**Interfaces:**
- Consumes: `RatingView` (Task 3), `MILESTONE_LABEL`, `MIN_RATINGS` (Task 2).

- [ ] **Step 1: `RatingStars`**: add `relative` to each `<label>` class list (keeps the `sr-only` radio on its star).
- [ ] **Step 2: Summary**: under `Average`, a line `text-xs text-muted-foreground tabular` with `MILESTONE_LABEL[m]: x.x` joined by ` · `, only entries with `average != null`; nothing rendered when none.
- [ ] **Step 3: Learner row**: label `Your rating at ${m}%` (`m` = `data.milestone`); earlier milestones read-only after the label as `${m}%` + `LuStar size-3.5 text-xp fill-xp/20` + stars; reason `progress` → "Rate this course when you reach 20%."
- [ ] **Step 4: No layout move**: delete the visible "Saved" span and the `saved` state; add `<span className="sr-only" aria-live="polite">` with "Rating saved" after a successful save.
- [ ] **Step 5: Verify** with the ui-consistency `adjusting` → `implementing` → `verifying` phases (the v1 checklist for this region still applies; add the breakdown line and history to it). Run `npx eslint components/course` — Expected: no output.
- [ ] **Step 6: Commit** `git commit -m "feat(rating): milestone row and breakdown, stars no longer shift"`

### Task 7: Prompt dialog per milestone

**Files:**
- Modify: `components/course/ratePromptDialog.jsx`, `stores/rewardsStore.js` (comment of `ratePrompt` shape only)
- Test: `__tests__/experience/rewardsStore.test.js`

**Interfaces:**
- Consumes: `ratePrompt: { milestone, stars: null }` from the lesson result (Task 3).
- Produces: store `ratePrompt: { courseId, milestone }`.

- [ ] **Step 1: Update the store test** so `askForRating({ courseId: "c", milestone: 50 })` is stored and `selectRatePromptOpen` still waits for the level-up dialog.
- [ ] **Step 2: Run** `npx vitest run __tests__/experience/rewardsStore.test.js` — Expected: FAIL until the shape changes, then PASS.
- [ ] **Step 3: Implement**: `askForRating({ courseId, prompt })` stores `{ courseId, milestone: prompt.milestone }`; `RatePromptForm` starts at 0 stars and uses this exact copy:
  - 20 — title "You're 20% in: how is the course so far?", description "Your rating helps other learners choose. You can rate it again at 50% and when you finish."
  - 50 — title "Halfway there: how is the course now?", description "Rate it again now that you are halfway. Your earlier rating stays as it was."
  - 100 — title "You finished the course: how was it?", description "This rating now counts for the course average."
  Buttons stay "Not now" / "Save rating" / "Saving…"; the success toast is "Thanks for rating this course."
- [ ] **Step 4: Commit** `git commit -m "feat(rating): prompt names the progress milestone"`

### Task 8: Whole-change verification

- [ ] **Step 1:** `npx vitest run` — Expected: all pass (DB-backed suites skipped without `DATABASE_URL`).
- [ ] **Step 2:** `npx eslint components mutations services db lib hooks` — Expected: no output.
- [ ] **Step 3: Signed-in Chrome** (`/course/nodejs-high-performance`, record the learner's stars and restore them at the end): click a star → star `x` position unchanged (measure the first label's `getBoundingClientRect().x` every 50 ms), one request (`/course/<id>` action only), dev overlay shows no issue; section shows "Your rating at N%", history and breakdown as the data allows.
- [ ] **Step 4: Prompt:** on a test course, complete the lesson that crosses 20% → dialog with the 20% copy; save → section shows the 20% stars.
- [ ] **Step 5:** run `ui-consistency:verifying` on `ratingSection.jsx` and `courseRatings.jsx` with a separate agent; fix what it reports.

---

# Phase 2 (spec v3): one vote per milestone

> Tasks 1-8 are done (commits `e909befc`..`7f22ad79`). Phase 2 implements spec rules 4, 8, 9, 10, 10a, 14 (v3): a milestone opens when progress reaches it or goes past it (only the highest reached one), takes **one vote that cannot be changed**, then stays closed until the next milestone. Stars only select; "Submit rating" casts the vote.

**Global Constraints (added):**
- No migration: the schema already holds one row per milestone; a learner never updates a row.
- 409 code `RATING_CLOSED`, message "You already rated this course at {m}%."; 403 `RATING_NOT_ALLOWED` stays for "nothing open".
- Copy (exact): "Rate it at {m}%", "Submit rating", "Submitting…", "Your next rating opens at {next}%.", "You rated every milestone of this course.", "Rate this course when you reach 20%.", "Enrol in this course to rate it.", live region "Rating submitted".

**Review Focus (Phase 2):**
1. **Double submit / two tabs** → the second insert hits the PK, answers 409, the client rolls back and refetches, the section shows the vote. Tests in Task 9 (`rate` 409, `insertVote` twice) and Task 10 (rollback + refetch).
2. **Progress drops below a voted milestone and climbs back** → it never reopens. Test in Task 9 (`openMilestone(20, [50])`).
3. **Jump 10% → 60%** → only 50 opens; after the 50 vote, 20 never opens. Test in Task 9.
4. **A migrated v1 rating at 100** → `reason: 'done'`, nothing open. Test in Task 9.
5. **A stray click on the stars** → no request until Submit. Check in Task 12 (browser).

### Task 9: One-vote rules on the server

**Files:**
- Modify: `lib/ratingRules.js`, `db/courseRating.db.js`, `services/courseRating.service.js`
- Test: `__tests__/rating/milestones.test.js`, `__tests__/learning/courseRating.test.js`, `__tests__/admin/adminRating.integration.test.js` (it calls `upsert`)

**Interfaces:**
- Produces in `lib/ratingRules.js`:
  - `openMilestone(reached: number|null, voted: number[]): number|null` — `reached` when it is not null and above every entry of `voted`, else `null`.
  - `nextMilestone(reached: number|null, voted: number[]): number|null` — first of `MILESTONES` above `max(reached ?? 0, ...voted)`, else `null`.
  - removes `currentMilestone`.
- Produces `courseRatingDb.insertVote({ userDbId, courseDbId, milestone, stars }) → { stars } | undefined` — `ON CONFLICT (user_id, course_id, milestone) DO NOTHING RETURNING stars`, keeps the hidden-learner `EXISTS` and its shortcut comment; removes `upsert`.
- `RatingView` v3: `{ average, count, breakdown, milestone /* open or null */, next, history /* every vote, ascending */, eligible, reason: 'signin'|'enroll'|'progress'|'voted'|'done'|null }` — no `stars`.
- `ratePromptFor` keeps its signature; asks when `after !== before` and `openMilestone(after, voted) === after`.

- [ ] **Step 1: Tests (RED).**
  - `milestones.test.js`: `openMilestone(20, [])→20`, `(50, [20])→50`, `(50, [50])→null`, `(20, [50])→null`, `(null, [])→null`, `(100, [20, 50])→100`; `nextMilestone(20, [20])→50`, `(40, [50])→100`, `(100, [100])→null`, `(null, [])→20`.
  - `courseRating.test.js`: 6/10 no votes → `milestone 50, next 100, history [], eligible true, reason null`; 6/10 with vote 50 → `milestone null, next 100, reason 'voted'`; vote 100 at 10/10 → `reason 'done', next null`; 4/10 with vote 50 → `reason 'voted'`; 1/10 → `reason 'progress'`; `rate` at 6/10 → `insertVote` with `milestone: 50`; `insertVote` resolves `undefined` → rejects 409 `RATING_CLOSED`; nothing open → 403 `RATING_NOT_ALLOWED`, no insert; `ratePromptFor` at 2/10 → `{ milestone: 20, stars: null }`, at 6/10 with vote 50 → `null`.
  - admin integration: replace `upsert` with `insertVote`; add "a second vote at the same milestone is refused": second `insertVote` resolves `undefined`, stars unchanged.
- [ ] **Step 2:** `npx vitest run __tests__/rating __tests__/learning/courseRating.test.js __tests__/admin/adminRating.integration.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces; `rate` revalidates the page and drops the Redis copy only when a vote was inserted.
- [ ] **Step 4:** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rating): one vote per milestone, closed until the next one`

### Task 10: Optimistic one-time vote

**Files:**
- Modify: `lib/ratingRules.js` (`applyRating`), `mutations/course.mutation.js` (`useCourseRate`)
- Test: `__tests__/rating/applyRating.test.js`

**Interfaces:** Consumes `RatingView` v3 and `nextMilestone` (Task 9). Produces `applyRating(view, stars) → view` v3.

- [ ] **Step 1: Tests (RED).** vote at 20 with `average 4, count 3, history [], breakdown [{20, 4, 3}]` + 2 → `history [{20, 2}]`, `milestone null`, `eligible false`, `reason 'voted'`, `next 50`, `count 4`, `average 3.5`, breakdown 20 → `{ average 3.5, count 4 }`; vote at 50 with `history [{20, 2}]`, `average 4, count 4` + 4 → `count 4`, `average 4.5`, 2 history entries, breakdown gains `{ milestone: 50, average: null, count: 1 }`; vote at 100 → `reason 'done'`, `next null`; a view with `milestone null` is returned unchanged; `undefined` unchanged.
- [ ] **Step 2:** `npx vitest run __tests__/rating` — Expected: FAIL.
- [ ] **Step 3: Implement** `applyRating`. In `useCourseRate`: `onError` restores the snapshots, then always invalidates the rating query (a 409 means the vote exists from another tab). Keep `scope`, `isLast`, snapshots and the own-comment star patch.
- [ ] **Step 4:** same command — Expected: PASS; `npx eslint mutations lib` — no output.
- [ ] **Step 5: Commit** `feat(rating): optimistic one-time vote`

### Task 11: Pick stars, then Submit

**Files:** Modify `components/course/params/ratingSection.jsx` (the prompt dialog already picks then saves; its copy stays true).

**Interfaces:** Consumes `RatingView` v3.

- [ ] **Step 1:** learner row: votes read-only first (as now); open milestone → label "Rate it at {m}%", `RatingStars` bound to local `picked` state (reset when `data.milestone` changes), `Button size="sm"` "Submit rating" (disabled while `!picked || rate.isPending`, "Submitting…" while pending) calling `rate.mutate({ courseId, stars: picked })`; nothing open → the reason copy (`voted` uses `data.next`). Keep `sm:shrink-0` on the row; the sr-only live region says "Rating submitted".
- [ ] **Step 2:** `npx eslint components/course` — no output; ui-consistency `verifying` on the region by a separate agent (Submit button size and variant as Discussion's "Post comment").
- [ ] **Step 3: Commit** `feat(rating): pick stars, then submit one vote`

### Task 12: Verification

- [ ] **Step 1:** `npx vitest run` — all pass.
- [ ] **Step 2: Signed-in Chrome**, `/course/nodejs-high-performance`: the account's 20% vote (1 star) → "Your next rating opens at 50%." and no stars to click. On a course where a milestone is open for the account, if any: clicking stars sends **no** request, Submit sends one, the row then shows the vote and the next-milestone text, dev overlay clean. If none is open, say so and rely on the unit tests.
- [ ] **Step 3:** final review of Phase 2 by a fresh reviewer (most capable model) with Review Focus (Phase 2).
