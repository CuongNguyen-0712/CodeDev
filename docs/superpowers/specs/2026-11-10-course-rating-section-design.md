# Course rating: milestone ratings, own section, optimistic save

Status: design (v3). v1 (own section, optimistic save) and v2 (milestones, editable current milestone) are implemented on `develop`. v3 changes rules 4, 8, 9 and 10: **one vote per milestone, locked once cast**; the plan's Phase 2 implements it.

## Context

Course ratings used to be one 1-5 star rating per learner, asked at lesson 3 and at completion. One number cannot show whether a course holds up: a learner who loved the first lessons and gave up at half counts the same as one who finished it.

v2 asks for a rating at three progress milestones, **20%, 50% and 100%**, so each learner can leave up to three ratings, and the course page shows how the course is rated at each stage.

## Business rules

Decided with the user:

1. **Milestones.** `20`, `50`, `100`, measured as completed visible lessons / visible lessons (the same count `public.submit_lesson` writes to `learning.register.progress`).
2. **100% = every lesson completed**, even if the course's completion rules (quiz / coding pass rates) are not met yet: it matches the progress bar.
3. **Up to three ratings per learner and course**, one per milestone, 1-5 stars.
4. **One vote per milestone, then it closes.** A milestone opens when the learner's progress reaches it or goes past it. The learner votes once (1-5 stars); the vote cannot be changed. The rating then stays closed until the next milestone is reached. (v3; replaces "the current milestone stays editable".)
5. **The public average counts each learner once, with their latest milestone rating** (highest milestone they rated, not hidden). `rating_count` = learners counted. A learner at 100% does not weigh three times a learner at 20%.
6. **The course page shows the average plus a breakdown per milestone** ("At 20%: 4.1 · At 50%: 4.3 · Finished: 4.6"), each shown only from `MIN_RATINGS` (3) ratings at that milestone. The main average keeps the same threshold.

Defaults taken in this design (say if any should change):

7. **Eligibility:** enrolled (not withdrawn) and progress >= 20%. Below that the reason is `progress` ("Rate this course when you reach 20%"). Replaces "one completed lesson".
8. **Only the highest reached milestone opens** (decided with the user). A learner who goes from 10% to 60% without voting gets the 50% vote; the 20% slot closes for good. A small course can jump a milestone in one lesson.
9. **The open milestone** is the highest milestone reached by progress, when it is above every milestone the learner voted on; otherwise nothing is open. So progress dropping (lessons added) never reopens a milestone, and a vote never comes back.
10. **The server picks the milestone and writes a vote once.** The client sends only `stars`. The insert never updates an existing row: a second vote at the same milestone (two tabs, a double submit) answers 409 `RATING_CLOSED`; no open milestone answers 403 `RATING_NOT_ALLOWED`.
10a. **The vote is submitted on purpose** (decided with the user): clicking stars only selects them; "Submit rating" sends the vote. After Submit the section updates at once (optimistic) and rolls back if the vote fails.
11. **Prompt:** on the first completion of a lesson (`awardedPoints > 0`) that brings progress into a new milestone, if that milestone is not rated, the lesson result carries `ratePrompt: { milestone, stars: null }`. Replaces `RATE_PROMPT_LESSON = 3` and the completion prompt. "Not now" closes it; the learner can still rate from the course page while that milestone is current.
12. **Moderation hides a learner, not one row.** The admin "hide rating" sets `is_hidden` on all of that learner's rows for the course (the admin list stays one row per learner, with their milestones), so a hidden learner is out of the average and the breakdown.
13. **Comments** show the author's latest visible milestone stars (as now, from the new rule 5 row).
14. **Existing ratings migrate** to the learner's current milestone by progress, or to `20` when below 20% (the old rule allowed one lesson). No rating is lost; each migrated or v2 rating counts as a cast vote (locked).

## Data model

`community.course_rating` (migration `20261110_0xx_course_rating_milestones.sql`):

- add `milestone smallint NOT NULL DEFAULT 20 CHECK (milestone IN (20, 50, 100))`, backfill per rule 14, then drop the default;
- primary key `(user_id, course_id)` becomes `(user_id, course_id, milestone)`;
- index `(course_id, user_id, milestone DESC) WHERE NOT is_hidden` for the "latest per learner" read.

`community.course_rating_refresh()` recounts from the latest visible row per learner:

```sql
SELECT ROUND(AVG(stars), 2), COUNT(*)::int
FROM (SELECT DISTINCT ON (user_id) stars
      FROM community.course_rating
      WHERE course_id = $1 AND NOT is_hidden
      ORDER BY user_id, milestone DESC) latest
```

It keeps writing `rating_avg`, `rating_count`, `rating` (NULL below 3) and `reviews` on `catalog.course`, so listings, filters, recommendations and the admin dashboard need no change. `MIN_RATINGS` in `lib/ratingRules.js` stays in step with the trigger.

The per-milestone breakdown is read on demand (`GROUP BY milestone`, a few rows per course), not stored.

## Server

- `lib/ratingRules.js`: `MILESTONES = [20, 50, 100]`, `milestoneFor(completed, total)` (highest milestone with `completed * 100 >= m * total`), `currentMilestone(reached, highestRated)` (rule 9). Pure, unit-tested. `RATE_PROMPT_LESSON` removed.
- `db/courseRating.db.js`:
  - `state()` also returns completed / total visible lessons and the learner's rows (`milestone`, `stars`, `is_hidden`);
  - `breakdown(courseDbId)`: `milestone, avg, count` of visible rows;
  - `upsert()` takes `milestone`, conflict on `(user_id, course_id, milestone)`.
- `services/courseRating.service.js` `view()`:

  ```js
  {
    average, count,                 // public, rule 5 and 6
    breakdown: [{ milestone, average /* null below 3 */, count }],
    milestone,                      // v3: the open milestone (rule 9), or null when nothing is open
    next,                           // v3: the next milestone that will open (null after 100 or below 20)
    history: [{ milestone, stars }],// v3: every vote cast, ascending, all locked
    eligible, reason,               // reason: 'signin' | 'enroll' | 'progress' | 'voted' | 'done' | null
  }
  ```

  `reason` v3: `progress` below 20%, `voted` when the last reached milestone is voted and a next one exists ("Your next rating opens at 50%."), `done` after the 100% vote ("You rated every milestone of this course."). `stars` is dropped from the view: an open milestone has no vote yet.

  `rate({ stars })` computes the open milestone; none → 403 `RATING_NOT_ALLOWED`; the insert is `ON CONFLICT DO NOTHING`, and no row inserted → 409 `RATING_CLOSED` (rule 10). It never takes a milestone from the client.
- `ratePromptFor()` per rule 11, without changing `public.submit_lesson`: `awardedPoints > 0` means this lesson was completed for the first time, so the milestone before is `milestoneFor(completed - 1, total)` and after is `milestoneFor(completed, total)`, with `completed` / `total` read by `state()` after the submit.
- A new milestone row of a hidden learner is written hidden too (rule 12), so rating again never escapes moderation.
- Admin (`db/adminRating.db.js`, `services/adminRating.service.js`): the list shows each learner's milestones; hide / show updates all of the learner's rows (rule 12); audit `before/after` records the milestones. The weekly chart counts rows as now.

## Client

- `useCourseRate` (optimistic, rolls back on error; v3: one vote, so no burst of saves):
  - `applyRating(state, stars)` v3: appends `{ milestone, stars }` to `history`, closes the milestone (`milestone: null`, `eligible: false`, `reason: next ? 'voted' : 'done'`); `count + 1` only when `history` was empty; the average replaces the learner's previous latest vote (`history` last) with the new one; the breakdown entry of the voted milestone gains the vote (`count + 1`).
  - a 409 `RATING_CLOSED` rolls back and refetches the rating (the vote exists from another tab).
  - **remove the `courseKeys.details` invalidation**: a rating changes no viewer state, and it costs two requests per click (`course-details`, `viewer-state`, measured).
- `RatingSection`:
  - summary: the average and count, then the breakdown line (milestones under 3 ratings left out, the line hidden when none qualifies);
  - learner row (v3): votes cast read-only ("20%: ★4"); when a milestone is open, "Rate it at 50%" + `RatingStars` (selection only, local state) + a "Submit rating" button (`size="sm"`, disabled until stars are picked, "Submitting…" while pending); reasons: `signin` → Sign in button, `enroll` → "Enrol in this course to rate it.", `progress` → "Rate this course when you reach 20%.", `voted` → "Your next rating opens at {next}%.", `done` → "You rated every milestone of this course.";
  - **the stars never move:** no visible "Saved" text after the stars (it pushed the right-aligned stars 36px twice per click, measured). Success goes to an `sr-only` `aria-live="polite"` region; errors show a toast and roll back.
- `RatingStars`: `relative` on each `<label>` so its `sr-only` radio sits on its star (it sits 700px below now, `offsetParent` is `body`).
- `RatePromptDialog`: the title names the milestone ("You're 20% in: how is the course so far?", "Halfway there…", "You finished the course…"); it saves through the same `useCourseRate`.
- Comment hydration fix (done): `CommentPage` holds the form's height until hydrated and the session is known (`hooks/useHydrated.js`).

## Error handling

- 403 `RATING_NOT_ALLOWED` (below 20%, not enrolled), 429 limiter `vote`, network: rollback + toast.
- A milestone that changed while the page was open (a lesson finished in another tab): the server writes the new current milestone; the answer replaces the optimistic state, so the section shows the right milestone.

## Testing

- Unit: `milestoneFor` (exact 20/50/100 boundaries, 1-lesson and 3-lesson courses, 0 lessons), `currentMilestone` (progress dropped), `applyRating` (first rating, change, rating at a new milestone with history, breakdown), `view()` reasons, `ratePromptFor` (crossing, not crossing, already rated, resubmitted lesson).
- Migration: run on a copy (`db/tools/migrate.mjs`), check the backfill and that `rating_avg` / `rating_count` match the old values for learners with one rating.
- Browser (signed-in Chrome): click a star, the stars do not move, one request; the breakdown and the prompt dialog after crossing 20%.

## Out of scope

Deleting a rating, written reviews, a public histogram, live update of the header average (ISR, refreshed by `revalidateTag`).
