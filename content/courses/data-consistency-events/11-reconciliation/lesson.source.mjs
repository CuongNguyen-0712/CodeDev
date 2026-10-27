// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-4-2",
    title: "Reconciliation: find and fix drift",
    slug: { _type: "slug", current: "reconciliation-find-and-fix-drift" },
    description:
        "A learner finished every lesson and got no certificate; another was refunded and kept both the certificate and the leaderboard XP. The outbox and the inbox were working - the drift came from a purged dead-letter queue and a projector bug. Learn why every event-driven read model eventually drifts, how a reconciliation job compares it with the source of truth, why it must skip changes still in flight, why it produces commands instead of writing directly, and how a cap, a priority and a dry run keep the fixer from becoming the next incident.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on the learning-progress team, CodeDev learning platform",
        problem:
            "Two tickets on Thursday. Ticket #9031: \"I finished all 12 lessons of Redis Patterns on Monday, the course page says 100%, but there is no certificate.\" Ticket #9040, from the finance team: a learner refunded on Tuesday still has the Redis Patterns certificate and still sits at rank 14 on the weekly leaderboard with the XP from that course. Both read models are fed by events from the outbox through idempotent consumers, and both pipelines show no errors today. Last Friday, someone purged the certificate consumer's dead-letter queue after a bad deploy; on Tuesday the leaderboard projector shipped a change that ignores EnrollmentCancelled events.",
    },

    content: [
        h2("1. The incident: two pipelines that work, two read models that are wrong"),
        p("Modules 1 to 3 made the pipeline reliable: the event is written in the same transaction as the change (lesson 1.3), published at least once (lesson 2.1), applied once per consumer (lesson 2.2), in order per key (lesson 3.1). Yet both tickets are real. Reliable delivery protects you from lost and doubled messages; it does not protect you from everything else that changes a read model:"),
        bullets([
            "**Messages removed on purpose.** The certificate consumer's DLQ held 41 `CourseCompleted` events after a bad deploy. Someone purged it instead of redriving it (the dead-letter queue lesson of Background Jobs & Messaging explains why that loses work). Those 41 learners never got a certificate.",
            "**A projector bug.** The leaderboard projector's new release ignores `EnrollmentCancelled`. Every refund since Tuesday left the XP in place.",
            "**Manual fixes.** A support engineer ran an `UPDATE enrollments` by hand to fix a payment issue. No event was written for it.",
            "**Events that never matched the data.** A migration backfilled `progress.xp` for old lessons directly in SQL.",
        ]),
        p("A read model built from events is a cache with a long memory. Without a way to compare it with the source of truth, every one of these problems stays until a learner notices."),

        h2("2. Read the evidence"),
        p("The source of truth is PostgreSQL: `enrollments` and `progress`. The read models are `leaderboard` (total XP per learner) and `certificates`. Start by counting what disagrees. For certificates, a full outer join shows both directions at once:"),
        code("sql", `
WITH expected AS (
    SELECT e.user_id, e.course_id
    FROM enrollments e
    JOIN progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
    WHERE e.status = 'active'
      AND p.total_lessons > 0 AND p.completed_lessons >= p.total_lessons
)
SELECT CASE WHEN c.user_id IS NULL THEN 'missing' ELSE 'extra' END AS kind, count(*)
FROM expected x
FULL OUTER JOIN certificates c ON c.user_id = x.user_id AND c.course_id = x.course_id
WHERE x.user_id IS NULL OR c.user_id IS NULL
GROUP BY 1;

  kind   | count
---------+-------
 missing |    43
 extra   |     9`, "psql, Thursday 10:20"),
        p("43 missing certificates: the 41 purged messages and 2 learners who finished a lesson in the last minute, whose events were still on their way. 9 extra: learners refunded since Tuesday. The leaderboard has the same shape of problem with a third kind, a wrong value:"),
        code("sql", `
WITH expected AS (
    SELECT e.user_id, sum(coalesce(p.xp, 0)) AS xp
    FROM enrollments e
    LEFT JOIN progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
    WHERE e.status = 'active'
    GROUP BY e.user_id
)
SELECT x.user_id, x.xp AS expected_xp, l.xp AS read_model_xp
FROM expected x
FULL OUTER JOIN leaderboard l ON l.user_id = x.user_id
WHERE x.xp IS DISTINCT FROM l.xp
ORDER BY abs(coalesce(x.xp, 0) - coalesce(l.xp, 0)) DESC
LIMIT 5;

 user_id | expected_xp | read_model_xp
---------+-------------+---------------
 u_2207  |         140 |           300     -- refunded on Tuesday: wrong value
 u_0419  |             |           150     -- no active enrollment left: extra
 u_3311  |         225 |           185     -- finished a lesson 20 s ago: in flight
 u_5150  |          60 |                   -- missing`, "psql"),
        p("Notice `u_3311`. Nothing is wrong there: the learner finished a lesson 20 seconds ago and the `ProgressRecorded` event is still in the outbox. Any comparison of a source with an asynchronous read model sees this kind of difference, and a fixer that treats it as drift will fight the pipeline."),

        h2("3. The core idea: compare, plan, then fix a little"),
        p("**Reconciliation** is a job that periodically compares a read model (or any copy) with its source of truth and produces the commands that make the copy match. It is the safety net under eventual consistency (lesson 3.3): the pipeline makes the copy right quickly in the normal case, and reconciliation makes it right eventually in every case, including the ones nobody predicted."),
        callout("info", "When you do not need it",
            "If the \"read model\" can be computed from the source when it is read - a SQL view, or a query on a replica - there is nothing to drift. If it is small enough to rebuild completely in a few seconds (build a new table, then swap it in one transaction), a nightly rebuild is simpler than a reconciler. Reconciliation earns its place when the read model is large, lives in another store, or has side effects (a certificate is also an email and a PDF) that a rebuild would repeat."),
        h3("Decide which side wins"),
        p("Reconciliation only works when one side is explicitly the source of truth. Here it is the `enrollments` and `progress` tables: if the leaderboard disagrees, the leaderboard is wrong. If you cannot say which side wins - two services that both accept writes for the same field - you do not have drift, you have a design problem, and no job can fix it."),
        h3("Three kinds of difference"),
        bullets([
            "**Missing**: the source says the row should exist and the read model has none (a certificate never issued, a learner absent from the leaderboard).",
            "**Extra**: the read model has a row the source does not justify (a certificate for a cancelled enrollment).",
            "**Wrong value**: both have the row, the values differ (XP still counting a refunded course).",
        ]),
        h3("Skip what is still in flight"),
        p("A difference on a key whose source changed a few seconds ago is most likely an event that has not been applied yet. Fixing it now is a race: if the projector applies increments (`xp = xp + 40`) and the reconciler writes the absolute value it computed, the learner can end up with the delta counted twice. The usual rule is a **grace period**: skip every key whose source changed less than N seconds ago, report it as deferred, and look again on the next run. N must be longer than the normal end-to-end lag of the pipeline (lesson 5.2 shows how to measure it) - and longer than the replica lag if the reconciler reads from a replica, because a stale replica looks exactly like drift."),
        callout("tip", "A more exact alternative",
            "If the read model stores, per key, the version or offset of the last event it applied, and the source stores the version of the last change, the reconciler can compare only keys whose versions match and skip the others. That removes the guess in the grace period, at the cost of a version column on both sides."),
        h3("Plan, then apply a little"),
        p("A reconciler is code that writes to production data in bulk, usually at night, usually without a human watching. It is also code with bugs. A query against an empty replica, a wrong join, a timezone mistake - and the \"source\" says nobody deserves a certificate. So it produces **commands** first, and applies them with brakes:"),
        bullets([
            "**A dry run.** The same comparison and the same commands, written to a report instead of applied. Run it first after every change to the reconciler.",
            "**A cap per run.** At most N fixes per run; the rest wait for the next run. A bug then damages N rows, not all of them, and a sudden jump in \"over the cap\" is itself an alert.",
            "**A fixed priority.** When the cap cuts the list, decide in advance what goes first: the differences learners see and suffer from (a missing certificate), then the ones that are wrong in the learner's favour (an extra certificate), then the leaderboard, largest error first. Deterministic order also makes two runs comparable.",
            "**Idempotent, absolute commands.** \"Set XP of u_2207 to 140\", not \"subtract 160\". Running the plan twice gives the same result.",
            "**Through the normal path when it has side effects.** Issue a missing certificate through the certificate service's command, so the PDF and the email happen as usual, instead of inserting a row.",
        ]),

        h2("4. Worked example: the reconcile job"),
        p("The job reads both sides in key ranges (keyset pagination on `user_id`, so it never loads all learners at once), computes the expected state, and turns differences into commands. The comparison for one batch, in TypeScript:"),
        code("typescript", `
type Fix =
    | { op: "certificate.issue" | "certificate.revoke"; userId: string; courseId: string }
    | { op: "leaderboard.upsert"; userId: string; xp: number; was: number | null }
    | { op: "leaderboard.delete"; userId: string; was: number };

function diffLeaderboard(expected: Map<string, number>, actual: Map<string, number>): Fix[] {
    const fixes: Fix[] = [];
    for (const [userId, xp] of expected) {
        const was = actual.get(userId);
        if (was !== xp) fixes.push({ op: "leaderboard.upsert", userId, xp, was: was ?? null });   // missing or wrong
    }
    for (const [userId, was] of actual) {
        if (!expected.has(userId)) fixes.push({ op: "leaderboard.delete", userId, was });     // extra
    }
    return fixes;
}

function inFlight(lastChange: number | undefined, now: number, graceSeconds: number): boolean {
    return lastChange !== undefined && now - lastChange < graceSeconds;
}`, "reconcile/leaderboard.ts"),
        p("Each run writes one row per finding to an audit table, applied or not. That table is the dry-run report, the history of what the job changed, and the input of the drift metrics:"),
        code("sql", `
CREATE TABLE reconcile_findings (
    run_id      bigint      NOT NULL,
    model       text        NOT NULL,      -- 'leaderboard' | 'certificates'
    key         text        NOT NULL,      -- 'u_2207' or 'u_2207:redis-patterns'
    kind        text        NOT NULL,      -- missing | extra | wrong_value
    command     jsonb       NOT NULL,
    outcome     text        NOT NULL,      -- applied | planned (dry run) | over_cap | deferred
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- what did last night's run find, by kind and outcome?
SELECT model, kind, outcome, count(*)
FROM reconcile_findings
WHERE run_id = (SELECT max(run_id) FROM reconcile_findings)
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;`, "migration + report query"),
        p("Applying is the easy part: each command is an upsert or a delete keyed by the learner (and course), executed in its own short transaction, so a crash in the middle of a run leaves some fixes applied and the next run simply finds fewer differences."),

        challenge("chal_quiz_dce_421"),

        h2("5. Build it: a reconciler with a grace period, a cap and a dry run"),
        p("In the exercise the source and the read models are in memory and the clock is a number of seconds. You write `reconcile(source, model, opts)`: compute the expected leaderboard and certificates from active enrollments, find missing, extra and wrong values, defer the keys still in flight, sort the rest by the fixed priority, keep the first `maxFixes`, and apply them unless it is a dry run:"),
        code("typescript", `
function reconcile(source: Source, model: ReadModel, opts: Options): Report {
    // 1. expected XP per learner and expected certificates, from active enrollments only
    // 2. differences in both directions, for both read models
    // 3. in flight? (any source row of that key changed less than graceSeconds ago)
    // 4. sort by priority, cut at maxFixes, apply unless opts.dryRun
    return { fixes: [], skippedByCap: [], deferred: [] };
}`, "main.ts"),
        p("The hidden tests check a change exactly `graceSeconds` old, cancelled enrollments, ties in the priority, a cap of zero, invalid options and a few hundred learners at once."),
        challenge("chal_coding_dce_422"),

        h2("6. How to verify a reconciler"),
        bullets([
            "**Seed drift on purpose.** In a test database, delete 10 certificates, add 3 for cancelled enrollments, change 5 XP values and touch 2 rows \"just now\". The dry run must report exactly those 18 differences, 2 of them deferred.",
            "**Run it twice.** After an apply run with no cap, a second run must find nothing new except keys that changed in between. If it finds the same differences again, the fix commands are not landing (or the projector is undoing them).",
            "**Watch drift found per run, not drift left after it.** \"0 open after the run\" is what a working reconciler always reports. The number found per run is the health of the pipeline: it should be near zero, and a steady non-zero rate with one pattern (one course, one client, one event type) points to a bug upstream.",
            "**Alert on the brakes.** Commands over the cap, a deferred count that keeps growing (the pipeline is stuck), or a run that finds more than, say, 1% of all rows different (the reconciler itself may be wrong) - each one pages a human instead of applying more.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**No grace period.** The reconciler \"fixes\" every learner who finished a lesson in the last seconds and races the projector. Spot it: the same keys show up as fixed by the reconciler and then changed again by the projector a moment later; with incremental projectors, values end up too high.",
            "**Writing directly, in bulk, with no cap or dry run.** One wrong join revokes every certificate. Spot it: the job has a single `UPDATE ... FROM` or a loop that applies everything it finds, and no report table.",
            "**Comparing against a lagging replica.** Every recent change looks like drift. Spot it: findings cluster on keys changed in the last few seconds before the run, and grow when replica lag grows.",
            "**Relative fix commands.** \"Subtract 160 XP\" applied twice, or applied after the projector already corrected it. Spot it: run the plan twice in a test.",
            "**Treating reconciliation as the fix.** The reconciler quietly repairs 200 rows an hour for months while the projector bug stays. Spot it: drift found per run never goes to zero; group the findings by event type or client and fix the cause.",
        ]),

        h2("8. Summary"),
        bullets([
            "Event-driven read models drift for reasons reliable delivery cannot prevent: purged messages, projector bugs, manual SQL, backfills. A reconciliation job compares them with an explicit source of truth and finds missing rows, extra rows and wrong values.",
            "Skip keys whose source changed within a grace period longer than the pipeline lag, or they race the projector. Produce idempotent, absolute commands; apply them with a dry run, a cap per run and a fixed priority.",
            "Measure drift found per run and alert on it: the reconciler repairs symptoms and points at the bug; it is not the fix.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: FULL OUTER JOIN and IS DISTINCT FROM (Queries, Table Expressions; Comparison Functions and Operators) - https://www.postgresql.org/docs/current/",
            "Chris Richardson, Pattern: CQRS - https://microservices.io/patterns/data/cqrs.html (read models kept up to date by events, and why they are eventually consistent).",
            "Lesson 3.3 (eventual consistency) and lesson 5.2 (monitoring lag, duplicates and drift) of this course.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the reconcile_findings report for one week of imaginary runs and decide your alert thresholds: how many findings per run is normal, how many deferred keys means the pipeline is stuck, and at what share of rows the reconciler must stop and page someone. Then list which fixes on CodeDev must go through a service command instead of a direct write, and why."),
    ],
});
