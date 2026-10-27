// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-2-1",
    title: "The progress service: validation & monotonic updates",
    slug: { _type: "slug", current: "progress-service-validation-monotonic-updates" },
    description:
        "A data audit found lessons at 140%, completed lessons whose challenges were never passed, progress stored under the wrong course, finished lessons back at 60% and one lesson completion counted three times on the leaderboard. Learn what the progress service must own: validation in a fixed order at the trust boundary, monotonic lesson percents, a course percent the service derives itself, and exactly one progress.updated event per real change, written as a pure decision function you can test.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer who owns the CodeDev progress service",
        problem:
            "Before the certificate service goes live, the data team ran an audit of course_progress. It found 1,204 lessons above 100%, 380 completed lessons whose required challenges were never passed, 92 rows where a lesson was stored under a course it does not belong to, and 2,610 lessons whose percent went down at some point according to progress_history. Certificates are issued from coursePercent = 100, so every one of these rows could become a certificate that should not exist, or a missing one. The current handler stores whatever the web app sends.",
    },

    content: [
        h2("1. The incident: a handler that trusts the client"),
        p("The audit query and a sample of what it found:"),
        code("sql", `
SELECT cp.user_id, cp.course_id, l.key AS lesson, l.value::int AS percent
FROM course_progress cp, jsonb_each_text(cp.lessons) l
WHERE l.value::int > 100
   OR NOT EXISTS (SELECT 1 FROM lesson WHERE lesson.id = l.key AND lesson.course_id = cp.course_id);

 user_id | course_id | lesson | percent
---------+-----------+--------+---------
 u_1882  | sql-201   | sql-3  |     140     <- client sent 140 after a rounding bug in the video player
 u_0417  | ts-101    | sql-2  |      80     <- sql-2 belongs to sql-201; a stale tab sent the wrong course
 ...                                          (1,296 rows)`, "audit, part 1"),
        code("text", `
progress_history for u_0093, ts-101 / ts-2
  2026-10-12 19:04:11  60 -> 100   (laptop)
  2026-10-12 19:04:13 100 ->  60   (phone tab opened at 18:50, sent its last known state on reconnect)

event log for u_binh, ts-101 / ts-2 (browser retried a timed-out PATCH twice)
  e_901 progress.updated lessonPercent=100   e_902 progress.updated lessonPercent=100   e_903 ...
  leaderboard: +10 lesson completed (x3)`, "audit, part 2"),
        p("This is the handler that produced all of it. It is short, and every line takes the client's word for something:"),
        code("typescript", `
// progress.controller.ts (current)
@Patch("progress")
async update(@Body() body: { courseId: string; lessonId: string; percent: number; coursePercent: number },
             @User() user: AuthUser) {
  await this.db.query(
    \`UPDATE course_progress
        SET lessons = jsonb_set(lessons, ARRAY[$3], to_jsonb($4::int)), course_percent = $5
      WHERE user_id = $1 AND course_id = $2\`,
    [user.id, body.courseId, body.lessonId, body.percent, body.coursePercent]);
  await this.events.publish("progress.updated", { userId: user.id, ...body });
  return { ok: true };
}`, "the handler"),

        h2("2. Read the evidence: five missing rules"),
        p("Each anomaly is one rule the service never enforced. Name them before writing code, because the fix is a list of rules, not a patch:"),
        numbered([
            "**Shape:** 140 is not a percent. Neither is `\"60\"`, `null` or `99.9` from a player that computes progress in floating point.",
            "**Reference:** the lesson must belong to the course in the request. The client's idea of which course a lesson is in can be stale or forged.",
            "**Authorization:** only an enrolled learner has progress in a course (paid courses depend on it).",
            "**Business rule:** a lesson is complete (100) only when its required challenges are passed. The video player cannot know that.",
            "**History:** a lesson percent never goes down, whatever order the requests arrive in. And events describe changes: a request that changes nothing publishes nothing.",
        ]),
        p("And one rule hides in the handler's signature: `coursePercent` comes from the client. A derived value accepted from outside will drift from the values it is derived from, and certificates are issued from it."),

        h2("3. Core idea: the service owns progress"),
        h3("Validate at the trust boundary, in a fixed order"),
        p("The browser, the mobile app and a retried request from three minutes ago are all outside the trust boundary. The progress service is the only writer of `course_progress`, so it is the one place where the rules can hold for every caller. Check them in a fixed order, cheapest and most general first, and stop at the first failure so that the error a client sees is deterministic:"),
        code("text", `
order  check                                                  error                    HTTP
1      percent is a JSON integer from 0 to 100                INVALID_PERCENT          400
2      the course exists                                      UNKNOWN_COURSE           404
3      the lesson belongs to that course                      LESSON_NOT_IN_COURSE     422
4      the learner is enrolled in the course                  NOT_ENROLLED             403
5      100 only if every required challenge is passed         CHALLENGES_NOT_PASSED    409`, "validation order"),
        p("Shape before lookups (a malformed request costs no queries), lookups before authorization (so a missing course is a 404, not a confusing 403), and the business rule last, because it needs everything else to be true before it means anything. API Design for Production covers the error contract these codes go into."),
        h3("Monotonic: progress never goes backwards"),
        p("A learner has a laptop, a phone and flaky Wi-Fi. Requests arrive late, out of order and more than once. \"Last write wins\" lets whichever request arrives last decide, which is how 100 became 60. The progress rule is simpler and needs no clocks: **store the new percent only if it is higher than the stored one; otherwise the request succeeds as unchanged**. A late 60 after a 100 is not an error the learner should see; it is old news."),
        p("When not to use it: if the product needs a real reset (\"restart this lesson\"), make it an explicit command with its own event (`progress.reset`), checked and logged, never a lower number sent through the same endpoint. Monotonic updates are also what make retries safe: sending the same 80 twice is harmless by construction."),
        h3("Derived values are computed, never accepted"),
        p("The course percent is a function of the lesson percents: `floor(sum of the percents of all lessons in the course / number of lessons)`, counting lessons the learner has not started as 0. Two details matter. Divide by **all** lessons of the course, not by the lessons started, or a learner with one finished lesson out of ten shows 100%. And round **down**: with four lessons at 100, 100, 100 and 99 the average is 99.75, and rounding to the nearest would show 100% and issue a certificate for an unfinished course."),
        h3("One event per real change"),
        p("Downstream consumers (leaderboard, certificates, notifications) treat each event as a fact. Consumer-side deduplication by `eventId` removes redeliveries of one event; it cannot tell that three different events describe one change. So the producer publishes exactly when the stored document changed, and puts in the event what consumers need without another query: the lesson percent, the new course percent and the document's **version**, which goes up by 1 per change and lets consumers order events and detect gaps (lesson 6)."),
        h3("The data model"),
        code("sql", `
CREATE TABLE course_progress (
  user_id        text    NOT NULL,
  course_id      text    NOT NULL,
  version        integer NOT NULL DEFAULT 0,            -- +1 per applied change (lesson 5 uses it for concurrency)
  lessons        jsonb   NOT NULL DEFAULT '{}',         -- {"ts-1": 40, "ts-2": 100}
  course_percent integer NOT NULL DEFAULT 0 CHECK (course_percent BETWEEN 0 AND 100),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);`, "one progress document per learner and course"),
        p("One document per learner and course keeps the course percent next to the values it is derived from and gives every change one version number. The alternative, one row per lesson, avoids conflicts between lessons but needs an aggregate query or a second table for the course percent; lesson 5 comes back to that trade-off when two devices write at once."),

        challenge("chal_quiz_sdc_211"),

        h2("4. Worked example: a pure decision function and its shell"),
        p("Put the rules in a function that takes the current document and the request and returns a decision, with no I/O: no database, no clock, no randomness. The service shell loads what the decision needs, calls it and writes the result. A pure core is trivial to test with thousands of generated cases, and it keeps the question of how to write safely under concurrency in one place (lesson 5). The signature is the contract:"),
        code("typescript", `
// progress/decide.ts - the five checks, the monotonic rule and the course percent from section 3
export type Decision =
  | { kind: "rejected"; error: "INVALID_PERCENT" | "UNKNOWN_COURSE" | "LESSON_NOT_IN_COURSE" | "NOT_ENROLLED" | "CHALLENGES_NOT_PASSED" }
  | { kind: "unchanged"; lessonPercent: number }                     // late, repeated or lower: nothing to write
  | { kind: "applied"; doc: Doc; event: ProgressUpdated };           // the new document and the one event it causes

export function decide(doc: Doc, update: Update, facts: Facts): Decision;`, "progress/decide.ts (signature)"),
        p("The shell around it maps each kind of decision to HTTP and to storage. The event is created by the same decision that created the document, so the two can never disagree, and it goes into the outbox in the same transaction as the write (lesson 3):"),
        code("typescript", `
// progress/progress.service.ts
async update(userId: string, body: UpdateDto): Promise<ProgressResponse> {
  return this.db.transaction(async (tx) => {
    const facts = await this.facts.load(tx, userId, body.courseId);   // course + required challenges, enrollment, passes
    const doc = await this.repo.load(tx, userId, body.courseId);
    const d = decide(doc, { ...body, userId }, facts);

    if (d.kind === "rejected") throw new ProgressError(d.error);        // 400 / 404 / 422 / 403 / 409, section 3
    if (d.kind === "unchanged") return { lessonPercent: d.lessonPercent, changed: false };

    await this.repo.write(tx, userId, body.courseId, d.doc);            // lesson 5: this write must not lose a concurrent one
    await this.outbox.add(tx, "progress.updated", { userId, courseId: body.courseId, ...d.event });
    return { lessonPercent: d.event.lessonPercent, coursePercent: d.event.coursePercent, changed: true };
  });
}`, "progress/progress.service.ts"),
        p("Because `decide` is pure, its invariants can be checked with generated input instead of a handful of examples. This property test (Vitest with fast-check) sends random sequences of valid updates for one learner and checks what must hold after any sequence:"),
        code("typescript", `
import fc from "fast-check";
import { expect, test } from "vitest";

const lessonIds = ["ts-1", "ts-2", "ts-3", "ts-4"];
const facts = { course: { lessons: lessonIds, required: {} }, enrolled: true, passed: new Set<string>() };
const updates = fc.array(fc.record({ lessonId: fc.constantFrom(...lessonIds), percent: fc.integer({ min: 0, max: 100 }) }));

test("stored percent = max sent, one event per increase, version = events", () => {
  fc.assert(fc.property(updates, (list) => {
    let doc = { version: 0, lessons: {} as Record<string, number>, coursePercent: 0 };
    let events = 0;
    const max: Record<string, number> = {};
    for (const u of list) {
      const d = decide(doc, { userId: "u_an", courseId: "ts-101", ...u }, facts);
      if (d.kind === "applied") { doc = d.doc; events++; }
      max[u.lessonId] = Math.max(max[u.lessonId] ?? 0, u.percent);
    }
    for (const id of lessonIds) expect(doc.lessons[id] ?? 0).toBe(max[id] ?? 0);
    expect(doc.version).toBe(events);
    const sum = lessonIds.reduce((s, id) => s + (max[id] ?? 0), 0);
    expect(doc.coursePercent).toBe(Math.floor(sum / lessonIds.length));
  }));
});`, "progress/decide.property.test.ts"),
        p("Run it with a deliberately broken `decide` (replace `<=` with `===` in the monotonic check, or divide by the number of started lessons) and fast-check prints the shortest sequence that breaks an invariant, often just two updates. That is the evidence that the test is strong enough."),
        callout("info", "When one SQL statement is enough",
            "If you only need \"never lower one lesson\", PostgreSQL can do it atomically in one statement, as the quiz showed: `SET percent = GREATEST(percent, $3)` on a per-lesson row, with `RETURNING` to see whether it changed. The pure function earns its place when the rules grow (enrollment, required challenges, a derived course percent, events): those are hard to express and to test in SQL, and easy in code."),
        p("Now write the core yourself. The challenge gives you the catalog, enrollments and passed challenges as data, an in-memory `ProgressStore` with one document per learner and course, and an `EventBus`. The runner sends a sequence of updates, including invalid, late and repeated ones, and prints each result, every published event and the final documents."),
        challenge("chal_coding_sdc_212"),

        h2("5. How to verify"),
        bullets([
            "**Example tests for each rule,** one per error code and one per boundary: 0, 100, 101, `\"60\"`, `null`, 99.9; a completion with one of two required challenges passed.",
            "**Property tests** as in section 4, plus a shuffle property: the same updates in any order give an identical final document, because a monotonic maximum does not depend on order.",
            "**Database constraints as a second line of defense.** `CHECK (course_percent BETWEEN 0 AND 100)`, and an invariant query in the nightly job that the service code cannot fake:",
        ]),
        code("sql", `
-- nightly invariants (each must return 0)
SELECT count(*) FROM progress_history WHERE new_percent < old_percent;                -- never lower
SELECT count(*) FROM course_progress cp, jsonb_each_text(cp.lessons) l
 WHERE l.value::int NOT BETWEEN 0 AND 100;                                           -- valid percents
SELECT count(*) FROM course_progress cp, jsonb_each_text(cp.lessons) l
 JOIN lesson_required_challenge r ON r.lesson_id = l.key
 LEFT JOIN challenge_pass p ON p.user_id = cp.user_id AND p.challenge_id = r.challenge_id
 WHERE l.value::int = 100 AND p.id IS NULL;                                          -- completion needs passes`, "invariant queries"),
        p("Run the invariant queries once on the old data first: they reproduce the audit, which proves they would have caught it."),

        h2("6. Common mistakes"),
        bullets([
            "**Validating in the client only.** The web app clamps to 100, the API stores 140 from an old app version or a script. Spot it: the service has no test that sends an out-of-range or non-integer percent.",
            "**Last write wins on progress.** Spot it: `SET percent = $3` with no comparison, and progress_history rows where `new_percent < old_percent`.",
            "**Accepting a derived value.** `coursePercent` in the request body. Spot it: any field in a write request that the server could compute from data it already has.",
            "**Averaging over started lessons, or rounding up.** One finished lesson shows 100%, or 99.75 shows 100. Spot it: a test with an unstarted lesson and one with 99.75 average.",
            "**An event per request instead of per change.** Spot it: event count equals request count in the logs, and consecutive events for one lesson with the same percent and version.",
        ]),

        h2("7. Summary"),
        numbered([
            "The progress service is the only writer of progress, so it validates every update at the trust boundary in a fixed order: shape, course, lesson in course, enrollment, completion rules.",
            "Lesson percents are monotonic (a lower or repeated value is unchanged, not an error), and the course percent is derived by the service: floor of the average over all lessons of the course.",
            "Publish exactly one progress.updated event per real change, with the new values and the document version, from a pure decision function that is easy to test with example and property tests and backed by database invariants.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, Patterns of Distributed Systems (Versioned Value) - martinfowler.com/articles/patterns-of-distributed-systems/",
            "PostgreSQL documentation, Conditional Expressions (GREATEST) - www.postgresql.org/docs/current/functions-conditional.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a write endpoint in a system you know and list every field of its request body. Mark which ones the server could derive, which need a reference check, which need an authorization check and which carry a business rule, then write the invariant query that would find rows breaking each rule. Run the queries on production data (read-only) and see what they find."),
    ],
});
