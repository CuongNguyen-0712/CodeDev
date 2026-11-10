# Course rating: milestone ratings, own section, optimistic save

Status: design (v2). v1 (one rating per learner, own section, optimistic save) is implemented on `develop`, not committed. v2 changes the business rules below; the v1 UI and mutation are reused.

## Context

Course ratings used to be one 1-5 star rating per learner, asked at lesson 3 and at completion. One number cannot show whether a course holds up: a learner who loved the first lessons and gave up at half counts the same as one who finished it.

v2 asks for a rating at three progress milestones, **20%, 50% and 100%**, so each learner can leave up to three ratings, and the course page shows how the course is rated at each stage.

## Business rules

Decided with the user:

1. **Milestones.** `20`, `50`, `100`, measured as completed visible lessons / visible lessons (the same count `public.submit_lesson` writes to `learning.register.progress`).
2. **100% = every lesson completed**, even if the course's completion rules (quiz / coding pass rates) are not met yet: it matches the progress bar.
3. **Up to three ratings per learner and course**, one per milestone, 1-5 stars.
4. **Only the current milestone is editable.** The current milestone is the highest one the learner has reached. Once the next one opens, the earlier ratings are locked, as snapshots of that stage.
5. **The public average counts each learner once, with their latest milestone rating** (highest milestone they rated, not hidden). `rating_count` = learners counted. A learner at 100% does not weigh three times a learner at 20%.
6. **The course page shows the average plus a breakdown per milestone** ("At 20%: 4.1 · At 50%: 4.3 · Finished: 4.6"), each shown only from `MIN_RATINGS` (3) ratings at that milestone. The main average keeps the same threshold.

Defaults taken in this design (say if any should change):

7. **Eligibility:** enrolled (not withdrawn) and progress >= 20%. Below that the reason is `progress` ("Rate this course when you reach 20%"). Replaces "one completed lesson".
8. **Skipped milestones stay empty.** A learner who reaches 50% without rating at 20% rates at 50%; the 20% slot is closed (rule 4). A small course can jump a milestone in one lesson.
9. **Progress can drop** (lessons added to the course). The current milestone is `max(milestone reached from progress, highest milestone already rated)`, so a learner never goes back to editing an older slot and never loses an open one.
10. **The server picks the milestone.** The client sends only `stars`; the server writes the learner's current milestone. A locked milestone cannot be written.
11. **Prompt:** on the first completion of a lesson (`awardedPoints > 0`) that brings progress into a new milestone, if that milestone is not rated, the lesson result carries `ratePrompt: { milestone, stars: null }`. Replaces `RATE_PROMPT_LESSON = 3` and the completion prompt. "Not now" closes it; the learner can still rate from the course page while that milestone is current.
12. **Moderation hides a learner, not one row.** The admin "hide rating" sets `is_hidden` on all of that learner's rows for the course (the admin list stays one row per learner, with their milestones), so a hidden learner is out of the average and the breakdown.
13. **Comments** show the author's latest visible milestone stars (as now, from the new rule 5 row).
14. **Existing ratings migrate** to the learner's current milestone by progress, or to `20` when below 20% (the old rule allowed one lesson). No rating is lost.

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
    milestone,                      // the learner's current milestone, or null below 20%
    stars,                          // their stars at `milestone`, or null
    history: [{ milestone, stars }],// their earlier, locked ratings
    eligible, reason,               // reason: 'signin' | 'enroll' | 'progress' | null
  }
  ```

  `rate({ stars })` computes the current milestone and refuses with 403 `RATING_NOT_ALLOWED` below 20%. It never takes a milestone from the client.
- `ratePromptFor()` per rule 11, without changing `public.submit_lesson`: `awardedPoints > 0` means this lesson was completed for the first time, so the milestone before is `milestoneFor(completed - 1, total)` and after is `milestoneFor(completed, total)`, with `completed` / `total` read by `state()` after the submit.
- A new milestone row of a hidden learner is written hidden too (rule 12), so rating again never escapes moderation.
- Admin (`db/adminRating.db.js`, `services/adminRating.service.js`): the list shows each learner's milestones; hide / show updates all of the learner's rows (rule 12); audit `before/after` records the milestones. The weekly chart counts rows as now.

## Client

- `useCourseRate` (already optimistic, `scope` in click order, last pending save writes the answer or rolls back):
  - `applyRating(state, stars)`: sets `stars`; `count + 1` only when the learner had no visible rating at all; the average replaces the learner's latest stars (`history` last or current) with the new value; the breakdown for `milestone` is updated the same way when it has an average.
  - **remove the `courseKeys.details` invalidation**: a rating changes no viewer state, and it costs two requests per click (`course-details`, `viewer-state`, measured).
- `RatingSection`:
  - summary: the average and count, then the breakdown line (milestones under 3 ratings left out, the line hidden when none qualifies);
  - learner row: "Your rating at 50%" + `RatingStars` for the current milestone; earlier milestones read-only beside it ("20%: ★4"); reasons: `signin` → Sign in button, `enroll` → "Enrol in this course to rate it.", `progress` → "Rate this course when you reach 20%.";
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
