// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-2-2",
    title: "Spot the AI mistake: two progress updates that overwrite each other",
    slug: { _type: "slug", current: "spot-ai-mistake-progress-updates-overwrite" },
    description:
        "An AI assistant wrote the progress service's save path: read the learner's progress document, change it in memory, write the whole document back. Its tests ran one request at a time and passed. With a laptop and a phone saving at once, one update silently erases the other. Learn to recognise a read-modify-write race, reproduce it deterministically, choose between atomic updates, a version column with compare-and-set, row locks and stricter isolation, and review AI-generated code for exactly this mistake.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer and code reviewer, CodeDev progress service",
        problem:
            "Two weeks after the new progress service shipped, support has 63 tickets that read the same way: \"I finished a lesson on my phone while another one was saving on my laptop, and one of them is back to 0%.\" The audit queries from lesson 4 are clean: no percent above 100, none lowered in progress_history. But the event log contains pairs of progress.updated events with the same learner, course and version, and certificates are now issued from these documents. The save path was written with an AI coding assistant, reviewed, and merged with green tests.",
    },

    content: [
        h2("1. The incident: green tests, missing lessons"),
        p("The request to the assistant was clear and even mentioned the risk: \"Write recordProgress for the CodeDev progress service. Validate the update, keep each lesson's percent monotonic (never lower it), recompute the course percent, save the learner's progress document and publish progress.updated once per real change. Use the ProgressDb interface below. Learners often have a course open on a laptop and a phone at the same time.\" This is what it produced:"),
        code("typescript", `
async function recordProgress(db: ProgressDb, bus: EventBus, courseLessons: string[], req: ProgressRequest): Promise<Result> {
  if (!courseLessons.includes(req.lessonId)) return { status: "rejected", error: "UNKNOWN_LESSON" };
  const percent = req.percent;
  if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { status: "rejected", error: "INVALID_PERCENT" };
  }

  const doc = await db.load(req.userId, req.courseId);
  const current = doc.lessons[req.lessonId] ?? 0;
  if (percent <= current) return { status: "unchanged", lessonPercent: current };

  doc.lessons[req.lessonId] = percent;
  doc.coursePercent = coursePercent(doc.lessons, courseLessons);
  doc.version += 1;
  await db.save(req.userId, req.courseId, doc);

  bus.publish({ type: "progress.updated", userId: req.userId, courseId: req.courseId, lessonId: req.lessonId,
                lessonPercent: percent, coursePercent: doc.coursePercent, version: doc.version });
  return { status: "applied", version: doc.version, coursePercent: doc.coursePercent };
}`, "recordProgress, as merged"),
        p("Read it as a reviewer would on a busy day: validation is right, the monotonic check is right, the course percent is derived, the version goes up, one event per write. Every rule from lesson 4 is visibly there. The tests (one request, then another) all pass. And this is the evidence from production:"),
        code("text", `
event log, learner u_an, course ts-101
  10:02:11.019  e_7731  progress.updated  lesson=ts-2 lessonPercent=100 coursePercent=56 version=7   (laptop)
  10:02:11.021  e_7732  progress.updated  lesson=ts-1 lessonPercent=60  coursePercent=36 version=7   (phone)

SELECT version, lessons, course_percent FROM course_progress WHERE user_id = 'u_an' AND course_id = 'ts-101';
  version | lessons                         | course_percent
  7       | {"ts-1": 60, "ts-3": 85}        | 36             <- ts-2 = 100 is gone`, "production evidence"),
        p("Two events with version 7 are the fingerprint. Version 7 was supposed to mean \"the seventh change\"; two different changes both believe they are the seventh, which can only happen if both started from version 6."),

        h2("2. Reproduce it: make the interleaving happen on purpose"),
        p("Line up the two requests on a time axis. Each `await` is a point where the other request can run:"),
        code("text", `
time   laptop (ts-2 = 100)                      phone (ts-1 = 60)
 .004  load -> v6 {ts-1:40, ts-3:85}
 .006                                            load -> v6 {ts-1:40, ts-3:85}
 .019  save v7 {ts-1:40, ts-2:100, ts-3:85}
 .021                                            save v7 {ts-1:60, ts-3:85}      <- built from v6, erases ts-2`, "the lost update"),
        p("This is the **lost update** anomaly: two read-modify-write cycles overlap, and the second write is based on a read that is already out of date, so it silently replaces the first. Nothing failed, nothing was logged, both learners' screens said \"saved\". Sequential tests can never show it, because in a sequential test the second load always sees the first save."),
        p("You can reproduce it in PostgreSQL with two `psql` sessions, which also shows that wrapping each request in a transaction does not help at the default isolation level:"),
        code("sql", `
-- session A                                        -- session B
BEGIN;                                              BEGIN;
SELECT version, lessons FROM course_progress
 WHERE user_id = 'u_an' AND course_id = 'ts-101';
                                                    SELECT version, lessons FROM course_progress
                                                     WHERE user_id = 'u_an' AND course_id = 'ts-101';
UPDATE course_progress SET version = 7,
  lessons = '{"ts-1":40,"ts-2":100,"ts-3":85}'
 WHERE user_id = 'u_an' AND course_id = 'ts-101';
                                                    UPDATE course_progress SET version = 7,
                                                      lessons = '{"ts-1":60,"ts-3":85}'
                                                     WHERE user_id = 'u_an' AND course_id = 'ts-101';
                                                    -- blocks until A commits ...
COMMIT;
                                                    -- ... then UPDATE 1: it overwrites A's row
                                                    COMMIT;`, "two psql sessions, READ COMMITTED"),
        p("In code, a deterministic test controls when each database call completes, so the bad interleaving happens every run instead of once a week. The challenge at the end of this lesson uses exactly this: the test runner parks every request at its `await` on the database and decides which call PostgreSQL executes next."),

        h2("3. Core idea: four ways to make read-modify-write safe"),
        p("The race exists because the decision (\"60 is above 40, so write\") is made on data that can change before the write lands. Every fix closes that gap in one of four ways:"),
        h3("1. Do the read-modify-write inside one atomic statement"),
        p("Move the decision into the database so that read, compare and write happen under the row lock of a single statement:"),
        code("sql", `
UPDATE course_progress
   SET lessons = jsonb_set(lessons, ARRAY[$3],
                           to_jsonb(GREATEST(COALESCE((lessons ->> $3)::int, 0), $4))),
       version = version + 1
 WHERE user_id = $1 AND course_id = $2
   AND COALESCE((lessons ->> $3)::int, 0) < $4      -- only when it really goes up
RETURNING version, lessons;                          -- no row back = unchanged`, "per-field atomic update"),
        p("It is the cheapest fix and never retries. Its cost is that every rule must be expressible in SQL: here the course percent still has to be recomputed (another expression over all lessons) and the completion rule needs a subquery on challenge passes. As rules grow, the SQL becomes the place where business logic hides."),
        h3("2. Optimistic concurrency: a version column and compare-and-set"),
        p("Keep the decision in code (the pure `decide` function from lesson 4) and make the write conditional on nothing having changed since the read:"),
        code("sql", `
UPDATE course_progress
   SET lessons = $3, course_percent = $4, version = $5 + 1
 WHERE user_id = $1 AND course_id = $2 AND version = $5;   -- $5 = the version you loaded`, "compare-and-set on the version"),
        p("`UPDATE 1` means your decision was made on the current document and is now stored. `UPDATE 0` means someone wrote in between: load again and **decide again**, because the fresh document may change the answer (the lesson may already be at your percent, and then the right result is \"unchanged\", with no write and no event). Bound the loop: CodeDev allows 3 attempts, then answers `409 CONFLICT` and lets the client retry later. The version column also gives every change a unique, ordered number, which is exactly what the event needs."),
        h3("3. Pessimistic locking: SELECT ... FOR UPDATE"),
        p("Lock the row before reading it, inside a transaction. The second request waits at its `SELECT` until the first commits, then reads the new document. Simple and correct; the risk is holding the lock while doing anything slow (a network call, a grader) in the same transaction, which turns a race into a queue of waiting connections, the problem from lesson 3."),
        h3("4. Stricter isolation"),
        p("At `REPEATABLE READ` or `SERIALIZABLE`, PostgreSQL detects the conflict and fails the second transaction with a serialization error (SQLSTATE 40001). You still have to catch it and retry the whole transaction, so it ends up looking like option 2, with less control over which statement fails."),
        h3("Which one for CodeDev"),
        p("CodeDev uses **option 2**: progress rows carry a `version` column and every write is a compare-and-set with at most 3 attempts. Contention is low (one learner, a few devices), so retries are rare; no lock is held across awaits; the decision logic stays in one tested function; and the version doubles as the event version. When not to use it: a row many writers hit at once, like a global counter of submissions, would make most compare-and-sets fail and retry; use an atomic increment (option 1) or split the data into more rows instead. The same pattern appears at the HTTP level as ETags and `If-Match` (API Design for Production), and the anomaly itself is covered in Data Consistency & Event-Driven Patterns."),
        callout("warning", "Retry the decision, not the write",
            "The most common broken fix keeps the first decision and only retries the write with the new version. It turns \"lost update\" into \"lower value written on top of a higher one\": the phone's 40 was compared with an old 0, the laptop's 70 landed in between, and the retry writes 40 over 70. Every attempt must reload and run the whole decision again."),

        challenge("chal_quiz_sdc_221"),

        h2("4. Reviewing AI-generated code for lost updates"),
        p("Assistants write read-modify-write code naturally because it is the shape of most examples, and it looks complete. The request even mentioned two devices; the code addressed it nowhere, and nobody asked for the test that would show it. Review with this list:"),
        numbered([
            "**Find every load, change, save sequence.** Search for a read of a whole record followed by a write of the whole record: `load` ... `save`, `findOne` ... `save`, `SELECT` ... `UPDATE ... SET <all columns>`.",
            "**Ask what happens if another request runs at each `await` in between.** If the write does not check that its input is still current, it can overwrite a concurrent change.",
            "**Check the write's condition.** A `WHERE` with only the primary key, or a `save(doc)` with no version, is a blind overwrite.",
            "**Check what happens on conflict.** Is the decision re-run on fresh data? Is the retry bounded? What does the caller get when it gives up?",
            "**Check where side effects are.** Events, emails and points must happen after the write that succeeded, once; never before the write, and never once per attempt.",
            "**Ask for the interleaving test.** If the change does not come with a test that forces two requests to overlap, write it before approving. A green suite of sequential tests says nothing about concurrency.",
        ]),
        p("Now fix the assistant's code. The starter contains the merged `recordProgress`, an in-memory `ProgressDb` with `load`, `save` and `saveIfVersion`, and a scheduler that starts all requests of a test together and executes their database calls in a scripted order. The public tests run the requests one after the other and pass on the assistant's code, as its own tests did; the hidden tests interleave them, including a case where one request loses three times in a row."),
        challenge("chal_coding_sdc_222"),

        h2("5. How to verify the fix"),
        bullets([
            "**Interleaving tests.** Force the schedule from section 2 (both load, then both write) for different lessons and for the same lesson with the lower percent written last. Both lessons must survive; the lower one must end as unchanged with no event.",
            "**The two-session psql script.** With the compare-and-set statement, session B gets `UPDATE 0` instead of overwriting.",
            "**An invariant on events:** no two progress.updated events may share (userId, courseId, version). Run it over the event log or the outbox table:",
        ]),
        code("sql", `
SELECT payload ->> 'userId' AS user_id, payload ->> 'courseId' AS course_id, payload ->> 'version' AS version, count(*)
FROM outbox
WHERE topic = 'progress.updated'
GROUP BY 1, 2, 3
HAVING count(*) > 1;            -- must return no rows`, "duplicate versions"),
        bullets([
            "**Metrics for the retry loop:** count compare-and-set conflicts and final `CONFLICT` answers (`progress_cas_conflicts_total`, `progress_conflict_responses_total`). Conflicts should be rare and `CONFLICT` answers rarer; a sudden rise means a new client is hammering one document, which is worth finding before it becomes an outage.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Trusting a transaction to serialize read-modify-write.** Spot it: `BEGIN; SELECT ...; UPDATE ... WHERE id = $1; COMMIT;` at READ COMMITTED with no `FOR UPDATE` and no version check.",
            "**Retrying the write without re-deciding.** Spot it: a loop that reloads only to get the new version number, while the comparison with the stored percent happened once, before the loop.",
            "**Unbounded retries.** `while (true)` around a compare-and-set. Spot it: no attempt counter, and no error code for giving up; under contention a request can spin for seconds while holding an HTTP connection.",
            "**Publishing before the write succeeds.** Spot it: `bus.publish` above the conditional write, or inside the retry loop before the check of its result; duplicate events with one version are the symptom.",
            "**Testing concurrency only sequentially.** Spot it: no test in the suite controls the order of two in-flight requests.",
        ]),

        h2("7. Summary"),
        numbered([
            "Loading a document, changing it in memory and writing it back loses updates when two requests overlap: the second write is based on a stale read. Sequential tests cannot show it; duplicate versions in the event log can.",
            "Close the gap with an atomic statement, a version column with compare-and-set (reload, decide again, at most 3 attempts, then CONFLICT), a row lock, or stricter isolation with retries. CodeDev uses the version column; publish events only after the write that succeeded.",
            "Review AI-generated save paths for load-modify-save sequences, blind writes, retries that skip the decision and side effects in the wrong place, and require a test that forces the interleaving.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation, Transaction Isolation - www.postgresql.org/docs/current/transaction-iso.html",
            "Martin Fowler, Patterns of Distributed Systems (Versioned Value) - martinfowler.com/articles/patterns-of-distributed-systems/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search a codebase you know for a function that loads a record, changes it and saves it (ORM `save()` after `findOne()` is the usual shape). Write a test that runs two calls with controlled interleaving, for example by wrapping the repository so each call waits on a promise you resolve by hand. If it loses an update, fix it with the option from section 3 that fits the contention, and keep the test."),
    ],
});
