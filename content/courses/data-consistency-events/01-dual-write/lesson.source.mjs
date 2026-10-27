// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-1-1",
    title: "The dual-write problem: two systems, one commit",
    slug: { _type: "slug", current: "dual-write-problem-two-systems-one-commit" },
    description:
        "Six learners got a welcome email and an \"Enrolled\" badge for a course they were never enrolled in: the enrollment service published enrollment.created inside its PostgreSQL transaction, and then the COMMIT failed. Learn why a write to a database and a write to a broker can never commit together, why both orders (commit then publish, publish then commit) fail, why \"retry the publish\" and \"publish inside the transaction\" do not close the gap, and which designs do: the transactional outbox, change data capture and listen-to-yourself.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer, enrollments team, CodeDev learning platform",
        problem:
            "Monday 26 October, launch day of a new premium course with 500 seats. By the afternoon support has six tickets with the same story: \"I got the welcome email and the Enrolled badge, but the course page still shows the Enroll button.\" The enrollments table has no row for any of the six. The certificate service, which sends the welcome email and grants the badge when it receives enrollment.created, has a receipt for all six.",
    },

    content: [
        h2("1. The incident: a welcome email for an enrollment that does not exist"),
        p("The enrollment service of CodeDev is a NestJS service with its own PostgreSQL database. When a learner enrolls, it writes the enrollment and tells the rest of the platform about it with an `enrollment.created` event on the broker. The certificate service consumes that event to send the welcome email and grant the \"Enrolled\" badge; later lessons add the leaderboard and the wallet. On launch day the enroll handler looked like this:"),
        code("typescript", `
// enrollments/enrollment.service.ts (launch-day version)
async enroll(userId: string, courseId: string): Promise<Enrollment> {
  return this.db.transaction({ isolation: "serializable" }, async (tx) => {
    await this.assertSeatAvailable(tx, courseId);          // SELECT count(*) ... seats
    const enrollment = await tx.enrollments.insert({ userId, courseId, status: "active" });
    // Publish inside the transaction: "if the publish fails, the enrollment rolls back".
    await this.broker.publish("enrollments", {
      id: randomUUID(),
      key: enrollment.id,
      type: "enrollment.created",
      payload: { enrollmentId: enrollment.id, userId, courseId },
    });
    return enrollment;
  });                                                       // COMMIT happens here
}`, "enrollment.service.ts"),
        p("The author's reasoning is in the comment, and it sounds right: put the publish inside the transaction, and a failed publish rolls the enrollment back. What it does not cover is the opposite failure: the publish succeeds and the **commit** fails."),

        h2("2. Read the evidence"),
        p("The six tickets all fall in the first minutes of the launch, when hundreds of learners raced for the seats. The service log for one of them:"),
        code("text", `
10:00:41.207 INFO  POST /enrollments user=u_40211 course=postgres-performance
10:00:41.219 DEBUG publish enrollment.created key=enr_70318 id=6f0c... acked (9 ms)
10:00:41.224 ERROR tx COMMIT failed: could not serialize access due to read/write dependencies
                   among transactions (SQLSTATE 40001)
10:00:41.225 INFO  POST /enrollments 409 Conflict "please try again" 18 ms`, "enrollment-service log"),
        code("sql", `
-- enrollments database
SELECT id, user_id, status FROM enrollments WHERE user_id = 'u_40211';
-- (0 rows)

-- certificate service database
SELECT event_id, enrollment_id, received_at FROM enrollment_receipts WHERE user_id = 'u_40211';
--  event_id  | enrollment_id |        received_at
-- -----------+---------------+----------------------------
--  6f0c...   | enr_70318     | 2026-10-26 10:00:41.233+00`, "the two databases disagree"),
        p("Read it in order. The broker **acknowledged** the event at .219. PostgreSQL **refused** the commit at .224: under `SERIALIZABLE`, two transactions that both counted the seats and both inserted cannot both commit, so one of them gets SQLSTATE 40001 and is rolled back. The client got 409 and was told to try again. Nine milliseconds after the rollback, the certificate service processed an event about `enr_70318`, an id that now exists nowhere in the enrollments database."),
        p("Nothing in this code is unusual, and no component misbehaved. PostgreSQL did exactly what serializable isolation promises, the broker did exactly what an ack promises, and the consumer did exactly what the event told it. The bug is in the shape of the operation."),

        h2("3. Core idea: two commits are not one commit"),
        p("A database transaction makes a set of writes **to that database** atomic: all of them become visible at `COMMIT`, or none of them do. The broker is a different system with its own durability: when it acknowledges a publish, the message is in its log, and nothing PostgreSQL does afterwards can take it out. A business action that writes to both is a **dual write**: two independent commits, one after the other, with a gap between them in which the process can crash, time out or be told \"no\"."),
        p("There are only two orders, and you can enumerate every place a crash can land in each of them:"),
        bullets([
            "**Order A: commit, then publish.** A crash, a deploy, an OOM kill or a broker timeout after `COMMIT` and before the publish leaves a row with no event: a **lost event**. The learner is enrolled; nobody else ever hears about it.",
            "**Order B: publish, then commit** (which is what publishing inside the transaction callback really is). A failed commit, a constraint violation, a serialization failure or a crash after the publish leaves an event with no row: a **ghost event**. Everyone downstream acts on something that never happened.",
        ]),
        p("Both orders are consistent when nothing fails, which is why dual writes pass code review, pass tests and run for months. They fail on exactly the days with the most traffic: deploys, failovers, launches."),
        h3("Why \"just retry the publish\" does not close it"),
        bullets([
            "**The retry lives in the process that might die.** A loop around `publish` cannot run after the pod is killed between `COMMIT` and the first attempt. The state \"this event still has to go out\" is only in memory.",
            "**Outages outlast retry budgets.** Five retries with backoff cover seconds; a broker failover or a network partition lasts minutes. The request cannot wait that long, so the loop gives up and the event is lost anyway.",
            "**A timeout is ambiguous.** A publish that timed out may or may not be in the broker's log. Retrying it can produce a second copy, so consumers must cope with duplicates no matter what (module 2).",
        ]),
        h3("Why \"publish inside the transaction\" does not close it"),
        bullets([
            "**The broker does not take part in the PostgreSQL transaction.** Rollback undoes the rows; it cannot reach into the broker's log. That is the incident above: order B wearing the clothes of order A.",
            "**It holds the transaction open across a network call.** Row locks and a pooled connection stay taken for the whole publish. When the broker slows down, the enrollment database runs out of connections.",
            "**It couples availability.** If the broker is down, nobody can enroll, even though the database is fine. The broker became a hard dependency of the write path.",
        ]),
        callout("info", "What about two-phase commit?",
            "XA / two-phase commit can make two resource managers commit together, and PostgreSQL supports PREPARE TRANSACTION. But the common brokers (Kafka, SQS, most RabbitMQ setups) do not take part in XA with PostgreSQL, and where a coordinator exists it adds a blocking protocol, in-doubt transactions to recover by hand and latency on every write. In practice teams remove the second write from the request instead."),
        h3("When the dual write is acceptable"),
        p("Not every message deserves a pattern. If losing an occasional event is harmless and nothing else depends on it (an analytics ping, a cache warm-up, a \"someone viewed this course\" counter), commit then publish, log the failure, and move on. The question to ask is: **if this event is lost or appears without its row, who notices and what does it cost?** For an enrollment that grants a badge, sends an email and, later, issues a certificate, the answer is: the learner, support and the finance team."),

        h2("4. The menu of fixes"),
        p("Every working fix has the same idea: the request makes **one** durable write, and the second system is updated from that write later, by something that can retry safely. They differ in what that one write is."),
        bullets([
            "**Transactional outbox.** The request writes the business row and an `outbox` row describing the event, in the same PostgreSQL transaction. A separate relay reads pending outbox rows, publishes them and marks them sent. A crash anywhere leaves either both rows or neither, and pending rows survive restarts. Costs: a table, a relay process, at-least-once delivery (consumers deduplicate). Lessons 1.3 and 2.1.",
            "**Change data capture (CDC).** A connector such as Debezium reads PostgreSQL's write-ahead log through logical replication and turns committed changes into events. Only committed data reaches the log, so there are no ghosts. Costs: replication slots to operate, events shaped like rows unless you capture an outbox table, and a connector that becomes critical infrastructure. Lesson 4.3.",
            "**Listen to yourself.** The request only publishes the event; the service consumes its own event and writes its database from it, like every other consumer. The single write is the broker. Costs: the service cannot read its own write right after the request (the learner may not see \"Enrolled\" for a moment), and validation that needs the database (seats left) gets harder.",
        ]),
        p("For CodeDev the outbox is the default: it keeps validation and the business write in one PostgreSQL transaction, needs no new infrastructure beyond a relay, and the event content is designed by the team, not derived from a row. The scenario of the next lesson shows the other half of this incident, order A, and its fix."),
        challenge("chal_quiz_dce_111"),

        h2("5. Worked example: enumerate the crash points"),
        p("You do not need a broker to see the problem; you need to stop thinking about the happy path. This small program models the two writes as steps and crashes the process before each one, for both orders. Run it with Node 22+ (`node --experimental-strip-types dual-write-sim.ts`) or with `npx tsx`:"),
        code("typescript", `
// dual-write-sim.ts: every place a crash can land, for both orders of the two writes
type World = { row: boolean; event: boolean };
type Step = { name: string; apply: (w: World) => void };

const commit: Step = { name: "COMMIT enrollment", apply: (w) => { w.row = true; } };
const publish: Step = { name: "publish enrollment.created", apply: (w) => { w.event = true; } };

function explore(label: string, order: Step[]): void {
    console.log(label);
    for (let crashAt = 0; crashAt <= order.length; crashAt++) {
        const w: World = { row: false, event: false };
        for (const step of order.slice(0, crashAt)) step.apply(w);
        const where = crashAt < order.length ? \`crash before "\${order[crashAt].name}"\` : "no crash";
        const verdict = w.row === w.event ? "consistent" : w.row ? "LOST EVENT" : "GHOST EVENT";
        console.log(\`  \${where.padEnd(44)} row=\${w.row} event=\${w.event}  \${verdict}\`);
    }
}

explore("Order A: commit, then publish", [commit, publish]);
explore("Order B: publish, then commit", [publish, commit]);`, "dual-write-sim.ts"),
        code("text", `
Order A: commit, then publish
  crash before "COMMIT enrollment"             row=false event=false  consistent
  crash before "publish enrollment.created"    row=true event=false  LOST EVENT
  no crash                                     row=true event=true  consistent
Order B: publish, then commit
  crash before "publish enrollment.created"    row=false event=false  consistent
  crash before "COMMIT enrollment"             row=false event=true  GHOST EVENT
  no crash                                     row=true event=true  consistent`, "output"),
        p("Each order has exactly one bad crash point, and it is the gap between the two writes. Adding a retry adds steps after the gap, not inside it; moving the publish into the transaction callback just turns order A into order B. With an outbox the request has one step, `COMMIT enrollment + outbox row`, so there is no gap to crash in; the publish moves to a relay that can repeat it until it succeeds."),

        h2("6. How to verify"),
        p("A dual write is invisible to ordinary tests because ordinary tests never crash. Verify with checks that create or measure the gap:"),
        bullets([
            "**A crash-point test.** Wrap the database and the broker in fakes that can fail or \"kill the process\" at a named point (before commit, after commit, after publish), run the command once per point, restart, and assert the invariant: every committed row has exactly one event (by event id) and no event exists without its row. Lesson 1.2 builds this test.",
            "**A reconciliation query.** Compare what the source committed with what the consumer received, per minute. A steady zero is the evidence; any difference is a lost or ghost event with a timestamp you can match against logs.",
            "**Read the code for a network call between two commits.** `await broker.publish`, `await fetch`, `await queue.send` next to a `COMMIT` (before it, after it, or inside the transaction callback) is a dual write until proven otherwise.",
        ]),
        code("sql", `
-- Ghost events: receipts whose enrollment does not exist (run where both are visible,
-- e.g. the analytics warehouse that loads both tables)
SELECT r.event_id, r.enrollment_id, r.received_at
FROM   cert.enrollment_receipts r
LEFT   JOIN enroll.enrollments e ON e.id = r.enrollment_id
WHERE  e.id IS NULL
  AND  r.received_at >= now() - interval '1 day';`, "reconciliation.sql"),

        h2("7. Common mistakes"),
        bullets([
            "**Trusting the transaction callback.** Code inside `db.transaction(async (tx) => ...)` looks transactional, but only calls that go through `tx` are. Spot it: any call in the callback that does not take `tx` (a broker, an HTTP client, another repository) is outside the transaction.",
            "**Treating a 4xx or a rollback as \"nothing happened\".** The incident request answered 409 and still emitted an event. Spot it: for every error path of a command, ask which side effects already left the process.",
            "**A retry loop as the fix.** It shrinks the window for short blips and leaves crashes and long outages untouched. Spot it: kill the process between `COMMIT` and the first attempt in a test; the event never appears.",
            "**Swallowing the publish error.** `catch (err) { logger.warn(...) }` turns a lost event into a 201 that nobody investigates. Spot it: count those warnings; each one is a business action the rest of the platform never heard about.",
        ]),

        h2("8. Summary"),
        numbered([
            "A dual write (database + broker in one request) has a gap between two independent commits; commit-then-publish loses events, publish-then-commit creates ghost events, and publishing inside the transaction callback is publish-then-commit.",
            "Retries cannot cover a crash or an outage longer than the request, and the broker cannot be rolled back by PostgreSQL; two-phase commit is rarely available or worth it.",
            "Make one durable write per request and propagate it later with something that can retry: a transactional outbox (CodeDev's default), CDC, or listen-to-yourself. Prove it with a crash-point test and a reconciliation query.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Transactional outbox - microservices.io/patterns/data/transactional-outbox.html",
            "PostgreSQL documentation: Transaction Isolation, Serializable Isolation Level (SQLSTATE 40001) - postgresql.org/docs/current/transaction-iso.html",
            "PostgreSQL documentation: Logical Replication - postgresql.org/docs/current/logical-replication.html",
        ]),
    ],
});
