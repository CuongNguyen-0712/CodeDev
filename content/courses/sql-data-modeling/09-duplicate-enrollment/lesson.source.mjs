// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-3-3",
    title: "Stop duplicate enrollment: races & unique constraints",
    slug: { _type: "slug", current: "stop-duplicate-enrollment" },
    description:
        "A learner double-taps Enroll and ends up enrolled twice, and the progress report counts them twice. Work through one evidence pack - an API log, the handler's check-then-insert code and the duplicate rows - to see why application checks cannot stop a race, then fix it where it can be fixed: a unique constraint and INSERT ... ON CONFLICT, verified with a test that interleaves two requests.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "The course team reports that SQL & Data Modeling has 129 enrolled learners, but the learner list has only 128 different names: learner 1042 appears twice. The handler already checks for an existing enrollment before inserting, a teammate wants to fix the check, and another wants to disable the Enroll button in the Android app. Nobody has lined up the API log yet.",
    },

    content: [
        h2("1. The incident: one learner, two enrollments"),
        p("On Wednesday morning, learner 1042 taps **Enroll** on course 7 in the Android app. The app does not disable the button while the request is in flight, the tap registers twice, and two `POST /enrollments` requests leave the phone 12 ms apart. Both get `201 Created`. Nothing looks wrong to the learner."),
        p("Two days later the course team asks why the dashboard says 129 learners when the learner list has 128 different people. The handler has a check for exactly this case - it looks for an existing enrollment before inserting - so the first reaction in the team is \"the check must be broken\". Before anyone edits code, collect the evidence."),

        h2("2. The evidence pack"),
        p("Read all of it once, top to bottom, without drawing conclusions yet. The API runs several workers, each with its own database connection; the two requests were handled by two different workers."),
        code("text", `
2026-10-21 08:15:03.412 req=a71f POST /enrollments user_id=1042 course_id=7 client=android/3.4.0
2026-10-21 08:15:03.424 req=b902 POST /enrollments user_id=1042 course_id=7 client=android/3.4.0
2026-10-21 08:15:03.431 req=a71f check existing=0
2026-10-21 08:15:03.433 req=b902 check existing=0
2026-10-21 08:15:03.436 req=a71f insert enrollment_id=5531
2026-10-21 08:15:03.438 req=b902 insert enrollment_id=5532
2026-10-21 08:15:03.440 req=a71f 201 Created
2026-10-21 08:15:03.441 req=b902 201 Created`, "API log, filtered on user_id=1042"),
        code("python", `
def enroll(db, user_id, course_id, now):
    existing = db.execute(
        "SELECT count(*) FROM enrollments "
        "WHERE user_id = ? AND course_id = ? AND status <> 'cancelled'",
        (user_id, course_id)).fetchone()[0]
    log.info("check existing=%d", existing)
    if existing > 0:
        return 200, {"status": "already_enrolled"}
    cur = db.execute(
        "INSERT INTO enrollments (user_id, course_id, enrolled_at, status) VALUES (?, ?, ?, 'active')",
        (user_id, course_id, now))
    log.info("insert enrollment_id=%d", cur.lastrowid)
    return 201, {"status": "enrolled"}`, "api/enrollments.py"),
        code("sql", `
CREATE TABLE enrollments (
    enrollment_id INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (user_id),
    course_id     INTEGER NOT NULL REFERENCES courses (course_id),
    enrolled_at   TEXT    NOT NULL,
    status        TEXT    NOT NULL CHECK (status IN ('active', 'cancelled', 'completed'))
);`, "schema"),
        code("text", `
SELECT * FROM enrollments WHERE user_id = 1042 AND course_id = 7;

enrollment_id | user_id | course_id | enrolled_at             | status
--------------+---------+-----------+-------------------------+-------
         5531 |    1042 |         7 | 2026-10-21 08:15:03.436 | active
         5532 |    1042 |         7 | 2026-10-21 08:15:03.438 | active

SELECT COUNT(*) AS learners, COUNT(DISTINCT user_id) AS distinct_learners
FROM enrollments WHERE course_id = 7 AND status IN ('active', 'completed');

learners | distinct_learners
---------+------------------
     129 |               128`, "the rows and the report"),
        p("The progress report uses `COUNT(*)` over enrollments, so every duplicate row is one more \"learner\". Joined with `lesson_progress`, learner 1042's completed lessons are also counted twice, once per enrollment row (the fan-out from lesson 5)."),

        h2("3. Hypotheses, and what decides each one"),
        p("Write the possible causes down before you match them against the evidence. Each one needs a piece of evidence that would confirm it and one that would rule it out:"),
        code("text", `
Hypothesis                                   Confirmed by                         Ruled out by
H1 The check's WHERE clause is wrong         a check that ran after an insert     every check ran before any
                                             of the same pair and still saw 0     insert of that pair
H2 The client sent the request twice         two request ids from one device      one request id
H3 Check and insert race with each other     both checks before both inserts,     a check that saw the row
   and nothing in the table stops it         no unique rule on the pair
H4 The driver re-sent one INSERT             two inserts under one request id     one insert per request id`),
        p("Now match the log. **H1 is ruled out**: the checks ran at .431 and .433, the first insert at .436. At the moment each check ran, there was no row to find, so `existing=0` was the correct answer twice. **H4 is ruled out**: each request id has exactly one insert. **H2 is confirmed**, but it is the trigger, not the cause: clients send duplicates all the time. **H3 is the root cause**: two requests interleaved between their check and their insert, and the table has no rule that says a pair may appear only once."),

        h2("4. Why the application cannot stop this race"),
        p("The handler does two separate things: it **reads** (is there a row?) and then it **writes** (insert one). This pattern is called check-then-act, and between the two steps there is a gap. Any other request that reaches the same check inside that gap gets the same answer, and both go on to write. The diagram puts the two requests from the log on one timeline:"),
        image("check-then-insert-race", {
            alt: "Timeline diagram of two enroll requests for user 1042 and course 7. On the left, in red, the current code: request A checks and sees 0, request B checks and sees 0, A inserts row 5531, B inserts row 5532, and the table ends up with two rows. On the right, in green, with a unique constraint on user_id and course_id and INSERT ON CONFLICT: both checks still see 0, A inserts one row, B's insert hits the conflict, changes 0 rows and answers already_enrolled, and the table has one row. A bottom line says the check is a fast path and the constraint is the guarantee.",
            caption: "Both checks were right when they ran. Only a rule checked at write time sees the other request's row.",
        }),
        p("Each of the quick fixes the team proposed keeps the gap open:"),
        bullets([
            "**Fixing the check's SQL.** The check was correct. No `WHERE` clause can find a row that has not been inserted yet.",
            "**Disabling the button in the Android app.** Good for that client, but the same API serves the web app (two tabs), the iOS app, an HTTP client that retries after a timeout, and the admin import script. The server cannot rely on every client behaving.",
            "**Checking again after a short sleep.** It moves the gap, it does not close it. Two requests arriving at the same moment both pass both checks, and every enrollment becomes slower.",
            "**Wrapping the check and the insert in a transaction.** In PostgreSQL's default READ COMMITTED level, each transaction's check sees only committed rows, so both still see none. SERIALIZABLE would detect the conflict and abort one transaction with a serialization failure, but then every caller must retry. In SQLite, `BEGIN IMMEDIATE` around the check and the insert does serialize them, because SQLite has one writer at a time - but only in the code paths that remember to do it.",
        ]),
        p("What all of these have in common: the rule \"one enrollment per learner and course\" lives in application code, and application code runs in many copies at once. The database is the one place every write goes through, and a **unique constraint** is checked there, at the moment the row is written, whatever the timing and whichever code path wrote it. That is why the constraint is the guarantee, and the check in the handler is only a fast path for the common case."),
        callout("info", "What happens when two inserts really collide",
            "In PostgreSQL, if two transactions insert the same key at the same time, the second one waits until the first commits or rolls back, then either fails with a unique violation or, with ON CONFLICT, takes the conflict branch. In SQLite the writes are already serialized by the lock. Either way, exactly one row wins."),

        h2("5. The fix, in three steps"),
        h3("Step 1: find and remove the existing duplicates"),
        p("A unique index cannot be created while the table breaks it: `CREATE UNIQUE INDEX` fails with a constraint error. Find the duplicates first, decide which row to keep, then delete the others:"),
        code("sql", `
-- which pairs are duplicated, and how often
SELECT user_id, course_id, COUNT(*) AS n
FROM enrollments
GROUP BY user_id, course_id
HAVING COUNT(*) > 1;

-- keep the first enrollment of each pair (smallest enrollment_id), delete the rest
DELETE FROM enrollments
WHERE enrollment_id NOT IN (
    SELECT MIN(enrollment_id) FROM enrollments GROUP BY user_id, course_id
);`, "clean-up, after a backup"),
        p("Keeping the oldest row is a choice, not a rule. If the duplicates differ (one active, one completed), decide per pair, and check first whether other tables point at the rows you are about to delete. Run the clean-up inside a transaction (lesson 8), and run the `HAVING` query again before committing: it must return nothing."),

        h3("Step 2: make the rule part of the table"),
        code("sql", `
CREATE UNIQUE INDEX enrollments_user_course ON enrollments (user_id, course_id);`),
        p("For a new table you would write `UNIQUE (user_id, course_id)` in `CREATE TABLE`, or make `(user_id, course_id)` the primary key as in lesson 2. The index is also useful on its own: the handler's check and the progress report filter on exactly these columns. On a large, live PostgreSQL table, a plain `CREATE INDEX` blocks writes while it builds; lesson 10 covers `CREATE UNIQUE INDEX CONCURRENTLY` and the order of these steps on a running system."),

        h3("Step 3: write the insert that expects a duplicate"),
        p("With the constraint in place, the old `INSERT` would raise an error for the second request: the data is safe, but the learner gets a 500. A duplicate enroll is a normal event, so the insert should handle it. Both SQLite (since 3.24) and PostgreSQL support the same clause:"),
        code("sql", `
INSERT INTO enrollments (user_id, course_id, enrolled_at, status)
VALUES (1042, 7, '2026-10-21 08:15:03.438', 'active')
ON CONFLICT (user_id, course_id) DO NOTHING;`),
        p("The conflict target `(user_id, course_id)` must match a unique index or constraint, otherwise the statement is rejected. The handler then reads how many rows changed - `cursor.rowcount` in Python is 1 for a new enrollment and 0 for a duplicate - and answers `enrolled` or `already_enrolled`. In PostgreSQL you can add `RETURNING enrollment_id`: a duplicate returns no row. The other option is to keep the plain `INSERT` and catch the unique violation (SQLSTATE `23505` in PostgreSQL, `sqlite3.IntegrityError` in Python); it works, but in PostgreSQL the error also aborts the surrounding transaction."),
        p("`DO NOTHING` is not the only branch. `ON CONFLICT ... DO UPDATE SET ...` changes the existing row instead, `excluded` names the row you tried to insert, and an optional `WHERE` limits which existing rows may change. For example, a sign-up that updates a user's display name only when it is different:"),
        code("sql", `
INSERT INTO users (user_id, email, name)
VALUES (1042, 'learner1042@example.com', 'Minh Tran')
ON CONFLICT (email) DO UPDATE
    SET name = excluded.name
    WHERE users.name <> excluded.name;`, "upsert with a condition (users.email is UNIQUE)"),
        p("When the `WHERE` is false, nothing changes and the row count is 0, exactly like `DO NOTHING`. Your turn: the challenge has the incident's schema and blind insert, and a runner that replays requests the way the log shows them - every check of a burst first, then the inserts. Enrollments that were cancelled must be reactivated by a new enroll; active and completed ones must stay as they are."),
        challenge("chal_coding_sdm_332"),

        h2("6. Verify: reproduce the interleaving, not the happy path"),
        p("Calling `enroll(1042, 7)` twice, one call after the other, proves nothing: the old check already refuses the second call, so that test passes before and after the fix. A test for a race must force the order from the log:"),
        code("python", `
def test_interleaved_enrolls_create_one_row(db):
    # both checks first, as at .431 and .433 ...
    a = check(db, 1042, 7)
    b = check(db, 1042, 7)
    assert a == 0 and b == 0
    # ... then both inserts, as at .436 and .438
    first = insert_enrollment(db, 1042, 7, "2026-10-21 08:15:03.436")
    second = insert_enrollment(db, 1042, 7, "2026-10-21 08:15:03.438")
    assert (first, second) == ("enrolled", "already_enrolled")
    assert count_rows(db, 1042, 7) == 1`, "a test that fails on the old code"),
        numbered([
            "**Run the test on the old code first** and see it fail with two rows. A test that never failed has not shown that it can catch the bug.",
            "**Run it on the fixed code**: one row, the second request answers `already_enrolled`, no error.",
            "**Check the constraint exists in production**, not only in the migration file: `PRAGMA index_list('enrollments')` in SQLite, `\\d enrollments` in psql.",
            "**Watch the data**: the `HAVING COUNT(*) > 1` query from step 1 must keep returning no rows, and the dashboard's `COUNT(*)` must equal `COUNT(DISTINCT user_id)`.",
        ]),
        p("Now test yourself on the evidence pack. Each statement is one step of the method:"),
        challenge("chal_quiz_sdm_331"),

        h2("7. Pitfalls"),
        bullets([
            "**Treating the check as the guarantee.** Keep it - it answers most duplicates without an error - but the constraint is what makes duplicates impossible. Detect the gap by asking: what if two requests reach this line at the same time?",
            "**A unique index on the wrong columns.** `UNIQUE (user_id)` stops a learner from taking a second course. The key is the pair, `(user_id, course_id)`. Detect it with a test that enrolls one learner in two courses.",
            "**Adding the constraint without changing the insert.** The data is safe, but every double tap now becomes a 500 error. Handle the conflict: `ON CONFLICT`, or catch the unique violation.",
            "**`DO UPDATE` without a `WHERE`.** Every duplicate request overwrites the existing row, for example resetting `enrolled_at` or turning a completed enrollment back to active. Limit the update to the rows that should change.",
            "**Forgetting the old duplicates.** The new index fails to build, or someone deletes the wrong copy in a hurry. Count them, decide, back up, then clean up in one transaction.",
            "**Testing the race with sequential calls.** It passes on the broken code. Force the interleaving.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every \"there can be only one\" rule in the domain (one enrollment per learner and course, one account per email) is a `UNIQUE` constraint or primary key, not only an application check.",
            "Existing duplicates were counted, resolved and removed before the unique index was created.",
            "Inserts that can legitimately repeat use `ON CONFLICT (...) DO NOTHING` or a `DO UPDATE` with a `WHERE`, and report from the changed-row count whether anything happened.",
            "A conflict is answered as a normal outcome (`already_enrolled`), not as a 500.",
            "A test runs both checks before both inserts and fails on the old code.",
            "The production schema is inspected to confirm the index exists, and the duplicate query is part of regular data checks.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Write a short root-cause report for this incident: the symptom, the four hypotheses and the evidence that decided each one, the root cause, the three-step fix and the interleaving test. Then list two other \"only one\" rules in the CodeDev schema (for example one lesson_progress row per learner and lesson) and check whether each one is enforced by a constraint or only by application code."),

        h2("Sources"),
        bullets([
            "SQLite documentation: \"UPSERT\" (ON CONFLICT ... DO NOTHING / DO UPDATE, the excluded table) and \"CREATE INDEX\" (unique indexes).",
            "PostgreSQL documentation: \"INSERT\" (the ON CONFLICT clause), section 5.5 \"Constraints\" (unique constraints), and Appendix A \"PostgreSQL Error Codes\" (23505 unique_violation).",
            "PostgreSQL documentation: section 13.2 \"Transaction Isolation\" (what READ COMMITTED and SERIALIZABLE guarantee for concurrent inserts).",
        ]),
    ],
});
