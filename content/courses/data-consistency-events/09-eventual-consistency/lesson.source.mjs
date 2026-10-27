// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-3-3",
    title: "Eventual consistency users can live with",
    slug: { _type: "slug", current: "eventual-consistency-users-can-live-with" },
    description:
        "Learners finished a course, opened their certificates and read \"You have no certificates yet\" - the certificate arrived 20 seconds later, after support had already issued duplicates by hand. Learn what eventual consistency means to a user, how to give the person who made a change read-your-writes, how to show a pending state instead of a false one, how to bound and measure staleness end to end, and which data must never be eventually consistent: payments, balances and enrollment uniqueness.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer, CodeDev learning platform",
        problem:
            "After a marketing campaign doubled course completions, support received 61 tickets in one afternoon: \"I completed the course but there is no certificate.\" Every one of those learners had a certificate a few seconds to a minute later. Before that, 14 learners had been issued a certificate by hand through the admin tool, and then received a second one, with a different number, from the system. Several learners clicked \"Mark as complete\" on the last lesson again and again. Nothing in the pipeline had failed.",
    },

    content: [
        h2("1. The incident: nothing failed, and users still saw a bug"),
        p("Issuing a certificate is a chain: the progress service marks the enrollment completed, its outbox publishes `enrollment.completed`, the certificates service consumes it and issues the certificate. Each step is correct and idempotent after the earlier lessons. This is one learner's afternoon, stitched together from the logs by trace id:"),
        code("text", `
14:02:07.112  web         POST /lessons/l_12/complete u_17            -> 200 {"progress":100}
14:02:07.130  progress    enrollment e_9001 completed_at set (commit)
14:02:07.950  outbox      enrollment.completed e_9001 published (p2 offset 4410)
14:02:08.300  web         GET /me/certificates u_17                   -> 200 []
                          page: "You have no certificates yet"
14:02:15.020  support     ticket #5512 "completed the course but no certificate"
14:02:31.004  certificates consumer received p2#4410 (consumer lag 23 s at peak)
14:02:31.420  certificates CRT-2026-08812 issued for e_9001`, "trace 7b1e..., learner u_17"),
        p("The system did exactly what it was designed to do: the certificate exists 24 seconds after the completion. The bug is in what the page **said** at 14:02:08. \"You have no certificates yet\" was false - the learner had earned one - and it pushed people to retry, to write to support, and support to act on it."),

        h2("2. What eventual consistency means to a user"),
        p("A system is eventually consistent when, if no new writes arrive, every copy and every read model converges to the same state. Two things are missing from that definition, and users notice both:"),
        bullets([
            "**There is no time bound.** \"Eventually\" can be 50 ms or 40 minutes. A bound exists only if you set one, measure it and alert on it.",
            "**It says nothing about what users see in between.** In between, a read model can show a value that is **not yet** there (the missing certificate), a value that goes **backwards** (a reload served by a replica further behind than the last one), or the user's **own change** missing (a renamed learner who still sees the old name).",
        ]),
        p("Eventual consistency is a property of the data. Whether it is acceptable is a property of the **experience**: a leaderboard that is 30 seconds old is fine if it says so; a certificates page that says \"none\" for 30 seconds is not, because the learner reads it as a fact about what they earned."),

        h2("3. Data that must stay strongly consistent"),
        p("Before designing the experience of lag, decide where lag is not allowed at all. A rule that works well: **an invariant that money, access or uniqueness depends on is checked where the write happens, in one transaction - never against a read model.**"),
        bullets([
            "**Payments**: whether a payment was captured is decided by the payments service and the provider, never by a projection of payment events.",
            "**Enrollment uniqueness**: one enrollment per learner and course is a `UNIQUE (learner_id, course_id)` constraint on the enrollments table, checked by the `INSERT` itself. A search index or cache that says \"not enrolled\" can be seconds behind.",
            "**Balances with limits**: a points wallet that must not go below zero is debited with a conditional update (`UPDATE wallets SET balance = balance - $1 WHERE learner_id = $2 AND balance >= $1`) and the row count is checked.",
            "**Access right after a purchase**: the learner who just paid must be able to open the course. That is read-your-writes for the actor (next section), served from the source.",
        ]),
        p("Everything derived for display - leaderboards, dashboards, certificates lists, search, recommendations, counters - can lag, as long as the user is told the truth while it does."),
        callout("info", "Simplest first",
            "If the person who acts needs the result immediately and it lives in the same database, do it in the same transaction and skip the event. Make a step asynchronous only when it belongs to another service or read model, and the lag is acceptable to the people who will see it."),

        h2("4. Read-your-writes for the actor"),
        p("The person who made a change is the one most likely to look for it, immediately. Three techniques, from simplest to most general:"),
        numbered([
            "**Answer the command with the new state.** `POST /lessons/l_12/complete` already knows the course is complete; it returns `{ progress: 100, certificate: { status: \"pending\" } }` and the page renders that, without reading a read model back.",
            "**Merge the source of truth into the view for its owner.** The certificates list combines issued certificates (the read model) with enrollments that are completed but not yet certified (the source). The second group is shown as pending.",
            "**Carry a version.** The write returns a version - the event's sequence number, or for a PostgreSQL replica the commit position from `pg_current_wal_lsn()` - and the client sends it with its next read. The server answers from the replica or read model only if it has reached that version (`pg_last_wal_replay_lsn()` on a replica), otherwise from the primary or source. A fixed time window (\"read from the primary for 5 s after a write\") is cheaper, and correct only while the lag stays below the window.",
        ]),
        code("typescript", `
// certificates.controller.ts - GET /me/certificates
@Get("me/certificates")
async list(@CurrentLearner() learnerId: string): Promise<CertificateView[]> {
  const [issued, completed] = await Promise.all([
    this.certificates.findByLearner(learnerId),          // read model: eventually consistent
    this.enrollments.findCompleted(learnerId),           // source of truth: committed with the progress
  ]);
  const certified = new Set(issued.map((c) => c.enrollmentId));
  const pending = completed
    .filter((e) => !certified.has(e.id))
    .map((e): CertificateView => ({
      enrollmentId: e.id,
      courseId: e.courseId,
      status: Date.now() - e.completedAt.getTime() > 10 * 60_000 ? "delayed" : "pending",
    }));
  return [...issued.map((c): CertificateView => ({ ...c, status: "issued" })), ...pending];
}`, "certificates.controller.ts"),
        p("The page now has three honest states: **issued** (show and download), **pending** (\"Your certificate is being issued - this usually takes less than a minute\", updated by a push event or a poll with backoff), and **delayed** (\"This is taking longer than usual; we have been notified\") once the bound is exceeded. Nobody needs to open a ticket, and support has no reason to issue a certificate by hand."),
        callout("warning", "Pending is a promise",
            "Showing \"pending\" commits you to the outcome. Only show it when the source of truth says the certificate was earned, and alert when an item stays pending past the bound - otherwise the page just moved the false statement from \"none\" to \"soon\"."),

        h2("5. Bound staleness, and measure it end to end"),
        p("Write the bound down as an objective users would recognise, for example: **95% of certificates issued within 60 s of course completion, 99.9% within 10 minutes.** Then measure it from the source fact to the visible result, not hop by hop:"),
        code("sql", `
SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY lag_s) AS p50_s,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY lag_s) AS p95_s,
       max(lag_s)                                          AS max_s,
       avg((lag_s > 60)::int)                              AS share_over_60s
FROM (
  SELECT extract(epoch FROM c.issued_at - e.completed_at) AS lag_s
  FROM enrollments e
  JOIN certificates c ON c.enrollment_id = e.id
  WHERE e.completed_at >= now() - interval '1 day'
) t;

-- completed, not certified, older than the bound: the alert (and the input of reconciliation, lesson 11)
SELECT e.id, e.learner_id, e.course_id, now() - e.completed_at AS waiting
FROM enrollments e
LEFT JOIN certificates c ON c.enrollment_id = e.id
WHERE e.completed_at < now() - interval '10 minutes' AND c.id IS NULL;`, "certificate freshness (run where both tables are visible, e.g. the analytics replica)"),
        p("The second query matters more than the first: an end-to-end check also catches what per-hop metrics miss. Each hop still deserves its own number, because it tells you **where** the time went when the objective is missed:"),
        bullets([
            "**Outbox**: rows not yet published and the age of the oldest one (lesson 4).",
            "**Broker**: consumer lag per partition, in messages and, more usefully, in time (now minus the timestamp of the next message to consume).",
            "**Consumer**: handler duration and errors, and messages sent to the dead-letter queue - consumed, and still not applied.",
            "**Read model**: the timestamp of the last applied event, shown to users where it helps (\"Leaderboard updated 12 s ago\").",
        ]),

        challenge("chal_quiz_dce_331"),

        h2("6. How to verify the experience"),
        bullets([
            "**Test with a slow consumer.** In an integration test, hold the certificate consumer, complete a course and assert that GET /me/certificates returns the course as pending; then release it and assert issued. Repeat with the clock past the bound and assert delayed.",
            "**A synthetic learner.** Every five minutes, a test account completes a one-lesson test course in production and records how long its certificate takes. It measures exactly what users experience, even at 3 a.m. when no real learner is there to notice.",
            "**Read-your-writes check.** Rename a test learner and read the profile 100 times in a loop through the normal API; count reads that return the old name. With a version token the count must be zero; with a time window, run it during a replica lag spike.",
            "**Support as a signal.** Tag tickets about \"missing\" data. A drop in those tickets after a pending state ships is the evidence the change worked.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Rendering \"none\" from a read model.** Spot it: an empty-state message on a page fed only by a projection, with no look at the source for the user's own data.",
            "**Deciding an invariant with a read model.** Spot it: an \"already enrolled?\" or \"enough balance?\" check against a cache or search index before a write that costs money.",
            "**Measuring one hop and calling it freshness.** Spot it: the only freshness metric is consumer lag; nothing compares completed_at with issued_at.",
            "**A pending state with no bound.** Spot it: items that can stay \"pending\" forever with no alert and no delayed state.",
            "**Fixing lag with sleep.** Spot it: a `setTimeout` or a fixed redirect delay \"so the data is there\". It slows every user and still fails at the worst moment.",
        ]),

        h2("8. Summary"),
        bullets([
            "Eventual consistency has no built-in bound and says nothing about what users see meanwhile: design the in-between states (pending, delayed, \"as of\") so the page never states something false.",
            "Give the actor read-your-writes: answer commands with the new state, merge the source of truth for the user's own data, or compare versions - not timers.",
            "Keep payments, balances and enrollment uniqueness strongly consistent where the write happens; bound everything else with an objective you measure end to end and alert on.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: system administration functions (pg_current_wal_lsn, pg_last_wal_replay_lsn, pg_last_xact_replay_timestamp) and hot standby - postgresql.org/docs/current",
            "microservices.io: Transactional outbox and Saga patterns",
            "Werner Vogels, \"Eventually Consistent\" (Communications of the ACM, 2009): read-your-writes, monotonic reads and session guarantees",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every page of the CodeDev web app that is fed by an event-driven read model. For each, write what the user sees while it lags, whether that statement can be false, the freshness objective you would set, and the query or metric that measures it."),
    ],
});
