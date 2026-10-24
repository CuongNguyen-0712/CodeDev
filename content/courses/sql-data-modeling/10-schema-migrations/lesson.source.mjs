// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-sdm-3-4",
    title: "How to change a live schema safely",
    slug: { _type: "slug", current: "how-to-change-a-live-schema-safely" },
    description:
        "A release renamed enrollments.status to state. The migration took a few milliseconds, and for the next seven minutes every request served by the old version still running failed with \"no such column: status\" - and rolling back made it worse. Learn migrations as versioned scripts, adding a NOT NULL column with a default, backfilling in batches instead of one long lock, the expand-contract steps for a rename, testing a migration on a copy, writing a rollback plan, and what SQLite's ALTER TABLE cannot do without its 12-step table rebuild.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev platform team",
        problem:
            "Release v42 renamed enrollments.status to state to match the API's naming. The deploy script runs migrations first, then restarts the four application workers one by one. The migration finished in milliseconds. For about seven minutes, every My courses and Enroll request that reached a worker still running v41 failed with \"no such column: status\". When the on-call engineer rolled back to v41 to stop the errors, all four workers failed, because the column had already been renamed. Next quarter the team must also add a NOT NULL column to the 3.2-million-row enrollments table and fill it for old rows, and nobody wants a repeat.",
    },

    content: [
        h2("1. The incident: a fast migration, seven slow minutes"),
        p("The v42 release contained one migration and the code that used the new name:"),
        code("sql", `
-- migrations/0042_rename_enrollment_status.sql
ALTER TABLE enrollments RENAME COLUMN status TO state;`, "0042_rename_enrollment_status.sql"),
        p("The deploy log tells the rest:"),
        code("text", `
10:02:00  migrate   0042_rename_enrollment_status.sql ... ok (4 ms)
10:02:03  worker-1  restarting on v42
10:02:04  worker-3  v41  GET /my-courses   500  SqliteError: no such column: status
10:02:04  worker-2  v41  POST /enroll      500  SqliteError: no such column: status
...
10:09:31  worker-4  restarting on v42
10:09:33  errors stop
10:14:10  rollback to v41 requested
10:14:40  worker-1  v41  GET /my-courses   500  SqliteError: no such column: status`, "deploy.log"),
        p("Nothing about the SQL was wrong, and it was fast. The problem is **when** it ran: between the migration and the last restart, the database had the new shape while three, then two, then one worker still ran code that expected the old one. And once the rename was done, the old version could not come back."),

        h2("2. Reproduce it: two versions, one schema"),
        code("sql", `
-- what v41 runs on every My courses request
SELECT course_id, enrolled_at FROM enrollments WHERE user_id = ? AND status = 'active';

ALTER TABLE enrollments RENAME COLUMN status TO state;

SELECT course_id, enrolled_at FROM enrollments WHERE user_id = 3 AND status = 'active';
-- Error: no such column: status`, "sqlite3 codedev-copy.db"),
        p("Since SQLite 3.25.0, `RENAME COLUMN` also rewrites references inside the schema - indexes, triggers and views now say `state`. It cannot rewrite the SQL inside your application. In PostgreSQL the old query fails the same way (`column \"status\" does not exist`)."),
        p("The rule this lesson builds on: **during every deploy, the old and the new version of the code run against the same database.** With a rolling deploy that lasts minutes; with a stop-and-start deploy it is shorter but still there, and a rollback brings the old version back. So every schema change must work with **both** the code before it and the code after it."),

        h2("3. Migrations are versioned scripts"),
        p("A migration is a small SQL script, committed to the repository, that moves the schema from one version to the next. The rules that keep them trustworthy:"),
        bullets([
            "**Numbered and ordered.** `0041_...sql`, `0042_...sql`. Every environment - your laptop, CI, staging, production - applies the same files in the same order.",
            "**Recorded.** The database remembers which ones ran, in a `schema_migrations` table or, in SQLite, in `PRAGMA user_version`. A runner applies only what is missing.",
            "**Applied once, never edited.** Once a migration has run anywhere shared, fix mistakes with a new migration. Editing an old file makes environments silently differ.",
            "**One transaction each, where the database allows it.** SQLite and PostgreSQL can run most schema changes inside a transaction, so a failing migration leaves nothing half-done. (Some PostgreSQL commands, such as `CREATE INDEX CONCURRENTLY`, cannot run inside one.)",
        ]),
        code("sql", `
BEGIN;
-- the runner checks first: PRAGMA user_version must be 42
ALTER TABLE enrollments ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
PRAGMA user_version = 43;
COMMIT;      -- on any error: ROLLBACK, and both the column and the version stay as they were`, "applying 0043 in SQLite"),

        h2("4. Adding a column without breaking anything"),
        p("Adding a column is the safest change there is - old code does not know it exists and keeps working - as long as existing rows get a valid value. SQLite is strict about what it accepts:"),
        code("sql", `
ALTER TABLE enrollments ADD COLUMN source TEXT NOT NULL;
-- Error: Cannot add a NOT NULL column with default value NULL      (the table has rows)

ALTER TABLE enrollments ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
-- Error: Cannot add a column with non-constant default

ALTER TABLE enrollments ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
-- ok`, "add_column.sql"),
        bullets([
            "A `NOT NULL` column needs a constant, non-NULL `DEFAULT`, so that every existing row has a valid value the moment the column appears. Old code that inserts without the column gets the default too.",
            "**It is fast.** SQLite's `ADD COLUMN` only changes the table definition stored in the schema; it does not touch the existing rows, which simply read the default. The time does not grow with the size of the table. PostgreSQL 11 and later also skips rewriting the table for a constant default; a volatile default such as `clock_timestamp()` still rewrites every row.",
            "SQLite also refuses to add a `PRIMARY KEY` or `UNIQUE` column this way. Add the column, then create a unique index - which fails if existing rows already contain duplicates, so check first.",
        ]),
        p("When the right value for old rows is **not** a constant - for example a `source` worked out from each enrollment's history - add the column nullable (or with a placeholder default), and fill it with a **backfill**."),

        h2("5. Backfill in batches, not in one long lock"),
        p("The obvious backfill is one statement:"),
        code("sql", `
UPDATE enrollments SET state = status;     -- 3.2 million rows, one transaction`, "backfill_naive.sql"),
        p("On a copy of production, this took 41 seconds. SQLite allows **one writer at a time** for the whole database file, and a single statement is a single transaction. For 41 seconds, every enrollment, every completed lesson, every login that writes anything waits. A connection with `busy_timeout` set to 5,000 ms gives up after 5 seconds with `database is locked`. In WAL mode readers keep reading during the write; in the default rollback-journal mode, readers are also blocked while the change is being committed."),
        p("PostgreSQL has finer locks, but the same shape of problem: most `ALTER TABLE` forms take an `ACCESS EXCLUSIVE` lock that blocks reads and writes on that table. Even an instant `ALTER` must wait for every open transaction that has used the table, even one that only read from it, and every query on that table that arrives after it waits behind the `ALTER`. Set `lock_timeout` for migrations so they give up instead of freezing the table, and build indexes with `CREATE INDEX CONCURRENTLY`."),
        p("The fix in both databases is to keep each write transaction short. Process a small batch, commit, pause, repeat:"),
        code("sql", `
-- run in a loop, each statement in its own transaction, with a short pause in between,
-- until it reports 0 changed rows
UPDATE enrollments
SET    state = status
WHERE  rowid IN (SELECT rowid FROM enrollments WHERE state IS NULL LIMIT 1000);`, "backfill_batch.sql"),
        bullets([
            "Each batch holds the write lock for milliseconds, and other writers get their turn between batches.",
            "It is **idempotent**: it only touches rows still `NULL`, so you can stop it and start it again at any time.",
            "SQLite's `UPDATE ... LIMIT` exists only in builds compiled with a special option; the subquery on `rowid` works everywhere.",
            "Prove it finished: `SELECT COUNT(*) FROM enrollments WHERE state IS NULL OR state <> status;` must return 0.",
        ]),

        h2("6. Expand-contract: renaming without breaking either version"),
        p("A rename is really \"stop using one column, start using another\". Doing it in one step forces old and new code to disagree. **Expand-contract** (also called parallel change) splits it so that at every moment, the running code and the schema agree:"),
        image("expand-contract-rename", {
            alt: "Top, in red: the v42 release renames status to state at 10:02; workers still on v41 fail with no such column: status until 10:09, and a rollback to v41 fails on every worker. Bottom, in green: six expand-contract steps on a timeline. 1 expand: add the nullable state column. 2 deploy code that writes both columns and reads status. 3 backfill state in batches of 1,000. 4 deploy code that reads state and still writes both. 5 deploy code that writes only state. 6 contract: back up, then drop status. Under each step, which older version is still a safe rollback; after step 6 the only way back is restoring the backup.",
            caption: "Every step is compatible with the code before it and the code after it. The last step is the only one without an easy way back, so it comes last.",
        }),
        numbered([
            "**Expand.** Migration: `ALTER TABLE enrollments ADD COLUMN state TEXT;` and an index on it if `status` had one (building an index is one write transaction too, so time it on a copy). Old code ignores the new column.",
            "**Write both.** Deploy code that writes `status` **and** `state` on every insert and update, and still reads `status`. Wait until no worker runs the old version.",
            "**Backfill.** Copy `status` into `state` for older rows in batches (section 5), and run the check query until it returns 0. Doing this after step 2 matters: rows written by the old version during the deploy are covered too.",
            "**Switch reads.** Deploy code that reads `state` and still writes both. If it misbehaves, rolling back to step 2 code is safe: `status` is still complete.",
            "**Stop writing the old column.** Deploy code that writes only `state`. From now on `status` goes stale, so rolling back to the step 2 code would read old values.",
            "**Contract.** Once you are sure the earlier versions will not return, take a backup, drop the index on `status`, then `ALTER TABLE enrollments DROP COLUMN status;` (SQLite 3.35.0 or later; it refuses while an index uses the column).",
        ]),
        p("It is more releases than one `RENAME`, and each one is boring. Boring is the goal: no step has a moment where any running code sees a schema it does not understand."),
        challenge("chal_quiz_sdm_341"),

        h2("7. Test the migration on a copy, then plan the way back"),
        p("A migration that worked on your laptop's 50 rows says little about 3.2 million rows and years of odd data. Test on a copy of production data:"),
        code("sql", `
-- make a consistent copy while the app keeps running (SQLite 3.27.0+)
VACUUM INTO '/backups/codedev-2026-10-24.db';

-- then, on the copy:
.timer on
.read migrations/0044_add_state.sql
PRAGMA integrity_check;          -- ok
PRAGMA foreign_key_check;        -- no rows
SELECT COUNT(*) FROM enrollments; -- same as before the migration`, "sqlite3 /backups/codedev-2026-10-24.db"),
        bullets([
            "**Time it.** `.timer on` shows how long each statement held the database. Anything longer than your busy timeout needs batches or a maintenance window.",
            "**Run both versions' tests against the migrated copy.** The test suite of the **currently deployed** version must still pass on the new schema. That single check would have caught the v42 rename before it shipped.",
            "**Check the data, not only the errors.** Row counts before and after, and the query that proves a backfill is complete.",
        ]),
        h3("Write the rollback plan before you start"),
        p("For each step, write down how to undo it and what it costs. Expand-contract makes most of this short:"),
        bullets([
            "**Expand and write-both steps:** roll back by deploying the previous code. The new column stays and is harmless.",
            "**Backfill:** stop the loop; it can resume later. Nothing to undo.",
            "**Switch reads:** roll back to the write-both version.",
            "**Contract (drop):** there is no code rollback. The only way back is restoring the backup taken just before, which also loses every write made since. That is why it comes last, after a waiting period, with a fresh backup.",
        ]),
        callout("warning", "A \"down migration\" is not a rollback plan",
            "Many tools let you write a reverse script (re-add the column). After a DROP, it gives you the column back without its data. Plan rollbacks in terms of which code version can run against which schema, and keep the irreversible step separate, last and backed up."),

        h2("8. What SQLite's ALTER TABLE cannot do"),
        p("SQLite's `ALTER TABLE` supports four things: `RENAME TO` (the table), `RENAME COLUMN`, `ADD COLUMN` and `DROP COLUMN`. Everything else - changing a column's type, adding or removing `NOT NULL` or a `CHECK` on an existing column, changing a foreign key or its `ON DELETE` action - needs the table rebuild that the SQLite documentation describes as a 12-step procedure. In short:"),
        code("sql", `
PRAGMA foreign_keys = OFF;                 -- outside the transaction
BEGIN;
CREATE TABLE enrollments_new (             -- the new definition
  user_id     INTEGER NOT NULL REFERENCES users(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  enrolled_at TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, course_id)
);
INSERT INTO enrollments_new (user_id, course_id, enrolled_at, state)
  SELECT user_id, course_id, enrolled_at, state FROM enrollments;
DROP TABLE enrollments;
ALTER TABLE enrollments_new RENAME TO enrollments;
-- recreate the table's indexes, triggers and views here
PRAGMA foreign_key_check;                  -- must return no rows
COMMIT;
PRAGMA foreign_keys = ON;`, "rebuild_enrollments.sql"),
        p("The rebuild copies every row inside one write transaction, so on a big table it is exactly the long lock from section 5. Time it on a copy, and run it in a maintenance window if it takes longer than your users can wait. Read the official procedure before running it: the order of the steps, including saving and recreating indexes, triggers and views, matters."),

        h2("9. Pitfalls"),
        bullets([
            "**Rename or drop in the same release as the code change.** Old code is still running. Use expand-contract.",
            "**Backfill in one statement.** One transaction means one long lock. Batch it, and make it resumable.",
            "**Backfilling before every worker writes both columns.** Rows written by the old version during the deploy are missed. Backfill after step 2.",
            "**Testing only on an empty or tiny database.** Constraint errors on old data and long locks only show up on real volumes. Use a copy.",
            "**Editing a migration that already ran somewhere.** Environments drift apart. Add a new migration.",
            "**Dropping without a fresh backup.** The drop is the one step code cannot undo.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Migrations are numbered files in the repository, recorded in the database, applied once, each in a transaction.",
            "New NOT NULL columns have a constant default, or are added nullable and backfilled.",
            "Backfills run in small batches, are idempotent, and end with a check query that returns 0.",
            "Renames and drops follow expand-contract; at every step both the running and the previous version work.",
            "The migration was timed on a copy, and the deployed version's tests passed on the migrated copy.",
            "The rollback plan names the irreversible step, and a backup is taken right before it.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Plan the change of lesson_progress.completed_at from text to an integer Unix timestamp in SQLite, keeping the app online. Write each expand-contract step as a migration file and a code change, the backfill loop with its check query, and the rollback for each step. Then make a 1-million-row copy with a recursive CTE, time the one-statement backfill against the batched one, and run PRAGMA integrity_check at the end."),

        h2("Sources"),
        bullets([
            "SQLite documentation: \"ALTER TABLE\" (RENAME COLUMN, ADD COLUMN restrictions, DROP COLUMN, and \"Making Other Kinds Of Table Schema Changes\", the 12-step procedure), \"PRAGMA user_version\" and \"VACUUM INTO\".",
            "PostgreSQL documentation: \"ALTER TABLE\" (lock levels and when a table is rewritten), \"Explicit Locking\" (ACCESS EXCLUSIVE) and the lock_timeout setting.",
            "Danilo Sato, \"Parallel Change\", martinfowler.com bliki (the expand, migrate and contract pattern).",
        ]),
    ],
});
