// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-dce-1-1",
    title: "Where atomicity ends: the transaction boundary",
    slug: { _type: "slug", current: "where-atomicity-ends" },
    description:
        "A premium purchase was rolled back by PostgreSQL, yet the learner kept course access, received a receipt and appeared in the leaderboard - and kept their points. Learn exactly what a database transaction covers and what it never can (HTTP calls, the broker, email, cache, sequences, a COMMIT whose reply was lost), and practise the method this course uses everywhere: crash the code at every line and write down the state that survives.",
    estimatedTime: 35,

    scenario: {
        role: "Senior backend engineer, CodeDev payments and enrollments team",
        problem:
            "Learner 1042 bought the premium course \"Data Consistency & Event-Driven Patterns\" (course 31) for 1,000 reward points. The app showed \"Purchase failed, please try again\". An hour later the learner wrote to support: they can open every lesson of course 31, they received a receipt email, the certificate service lists them as enrolled, and their balance still shows 1,500 points. The database has no enrollment for them. The purchase handler runs everything inside BEGIN ... COMMIT, so the team's first reaction is \"that cannot happen, the transaction rolled back\".",
    },

    content: [
        callout("info", "How to read this course",
            "Every lesson follows one rule: assume the process can die after any line, the network can lose any reply, and the broker can deliver any message twice or out of order across keys. PostgreSQL is the source of truth throughout. The patterns - outbox, inbox, per-key ordering, replay, reconciliation, sagas - are broker-agnostic: they apply to Kafka, RabbitMQ, Amazon SQS or PostgreSQL LISTEN/NOTIFY combined with polling. What differs between brokers is the exact delivery and ordering guarantee (at-least-once or at-most-once, ordering per partition, per queue or none, how long an unacknowledged message stays invisible). Before you rely on a guarantee, find it in your broker's documentation, not in a blog post. The coding exercises use TypeScript with small in-memory fakes of a database, a broker and a clock, so a crash can be placed at an exact line and the result checked."),

        h2("1. The incident: a rollback that undid almost nothing"),
        p("The purchase endpoint was written the way most first versions are: open a transaction, do everything the purchase needs, commit at the end. If anything throws, roll back. It looks atomic."),
        code("typescript", `
// api/purchases.ts - the version that shipped
export async function buyCourse(userId: number, courseId: number, purchaseId: string) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows: [user] } = await client.query(
            "SELECT points FROM users WHERE id = $1 FOR UPDATE", [userId]);
        const course = await catalog.getCourse(courseId);
        if (user.points < course.pricePoints) throw new InsufficientPoints();

        await client.query("UPDATE users SET points = points - $1 WHERE id = $2",
            [course.pricePoints, userId]);
        const { rows: [enrollment] } = await client.query(
            "INSERT INTO enrollments (user_id, course_id, purchase_id) VALUES ($1, $2, $3) RETURNING id",
            [userId, courseId, purchaseId]);

        await entitlements.grant(userId, courseId);                    // HTTP to the access service
        await redis.set(\`access:\${userId}:\${courseId}\`, "1", { EX: 86400 });
        await broker.publish("enrollments", { type: "EnrollmentCreated", enrollmentId: enrollment.id, userId, courseId });
        await mailer.sendReceipt(userId, purchaseId);                   // SMTP

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}`, "api/purchases.ts"),
        p("The request log for the failed purchase, with every external call the handler made:"),
        code("text", `
14:02:11.102 req=7f3a purchase start user=1042 course=31 purchase=p-7731
14:02:11.109 req=7f3a db   BEGIN
14:02:11.118 req=7f3a db   SELECT ... FOR UPDATE            1 row
14:02:11.131 req=7f3a db   UPDATE users                     1 row
14:02:11.140 req=7f3a db   INSERT enrollments               id=5529
14:02:11.402 req=7f3a http POST /grants (access service)    201  262 ms
14:02:11.405 req=7f3a redis SET access:1042:31              OK
14:02:11.418 req=7f3a mq   publish enrollments EnrollmentCreated enrollmentId=5529  ack
14:02:16.977 req=7f3a smtp receipt p-7731 accepted          5559 ms
14:02:16.978 req=7f3a db   COMMIT -> error: terminating connection due to idle-in-transaction timeout
14:02:16.979 req=7f3a 500 purchase_failed`, "API log, req=7f3a"),
        code("text", `
postgresql.conf:   idle_in_transaction_session_timeout = 5s

users        id=1042  points=1500                      (debit rolled back)
enrollments  no row for (1042, 31); next id issued later was 5530, 5529 never appears
access svc   grant (1042, 31) active since 14:02:11.402
redis        access:1042:31 = "1", TTL 86400
certificates consumer: enrollment 5529 for user 1042, course 31 recorded
mail log     receipt p-7731 delivered to learner 1042`, "state one hour later"),
        p("Read the timeline as PostgreSQL saw it. After the `INSERT` at .140 the session sent nothing for more than five seconds: it was waiting for the access service, Redis, the broker and, above all, the mail server. To PostgreSQL that is a session sitting idle inside an open transaction while it holds a row lock on user 1042. `idle_in_transaction_session_timeout` exists for exactly this case, and it terminated the session. A terminated session's open transaction is rolled back, so the `COMMIT` at 16.978 had nothing left to commit."),
        p("PostgreSQL did its job perfectly: the debit and the enrollment are gone, all or nothing. Everything else the handler did is still there, because none of it was ever inside the transaction."),

        h2("2. What a transaction covers - and what it never covers"),
        p("A PostgreSQL transaction is a promise about **one database, through one session**: the changes made by the statements you send on that connection between `BEGIN` and `COMMIT` become visible and durable together, or not at all. That covers more than people expect, and much less than the code above assumed."),
        h3("Inside the boundary"),
        bullets([
            "**Row changes** made on this connection: `INSERT`, `UPDATE`, `DELETE`, including the index entries and the constraint checks that go with them.",
            "**DDL** such as `CREATE TABLE` or `ALTER TABLE`: in PostgreSQL most DDL is transactional and rolls back like data.",
            "**Row locks and transaction-level advisory locks**, which are released at commit or rollback.",
            "**`NOTIFY` / `pg_notify()`**: a notification issued inside a transaction is delivered only when, and only if, the transaction commits. It is the one messaging primitive here that is truly inside the boundary - but delivery is not durable: a listener that is not connected at that moment never gets it, which is why it is normally combined with polling.",
        ]),
        h3("Outside the boundary"),
        bullets([
            "**Anything another process does**: an HTTP call to the access service, a broker publish, an SMTP send, a Redis `SET`, a file or object-storage upload. ROLLBACK cannot reach into another system. Once the other side has accepted the request, the effect exists.",
            "**Another connection to the same database.** `pool.query(...)` borrows whichever connection is free: that statement runs in its own transaction and commits on its own, even if it runs on the same server in the middle of your `BEGIN ... COMMIT` block.",
            "**Sequences.** `nextval()` is never rolled back, so a rolled-back `INSERT` leaves a gap in the ids - enrollment 5529 above. A gap is normal and proves nothing about lost rows.",
            "**Time.** While the transaction waits on the network, it holds its locks. The `FOR UPDATE` on user 1042 blocked every other purchase and every points award for that user for the whole 5.9 seconds.",
            "**Knowledge of the outcome.** If the connection breaks after you sent `COMMIT` and before the reply arrives, the transaction may have committed or not. The client cannot tell from the error alone.",
        ]),
        image("atomicity-boundary", {
            alt: "Diagram in two panels. On the left, in red, the shipped handler: a box labelled BEGIN to COMMIT contains UPDATE users, INSERT enrollments, then an HTTP grant to the access service, a Redis SET, a broker publish and an SMTP receipt. The session is killed by the idle-in-transaction timeout and ROLLBACK removes only the two database rows; arrows show the grant, the cache key, the published event and the email surviving outside the box, and the enrollment id 5529 from the sequence is never reused. On the right, in green, the restructured handler: a short transaction with SELECT FOR UPDATE, UPDATE users and INSERT enrollments commits in milliseconds, and the external effects run only after COMMIT. A note under the green panel says the gap between COMMIT and the external effects is still open and is the subject of lesson 2.",
            caption: "ROLLBACK undoes rows on one connection. It cannot recall an HTTP call, a message, an email or a cache write.",
        }),

        h2("3. The method: crash the code at every line"),
        p("\"What happens if this fails?\" is too vague to answer. Ask a sharper question for every line instead: **if the process dies right after this line, or this call times out without an answer, what state survives?** Durable state is what the database committed plus what other systems accepted; everything in memory is gone. Apply it to the shipped handler:"),
        code("text", `
dies after ...              DB (users, enrollments)   access   cache   event   receipt   learner sees
--------------------------  ------------------------  -------  ------  ------  --------  -------------
UPDATE / INSERT             rolled back               -        -       -       -         error, no charge   ok
entitlements.grant()        rolled back               GRANTED  -       -       -         free access        BAD
redis.set()                 rolled back               GRANTED  set     -       -         free access        BAD
broker.publish()            rolled back               GRANTED  set     SENT    -         ghost enrollment   BAD
mailer.sendReceipt()        rolled back               GRANTED  set     SENT    SENT      receipt, no charge BAD
COMMIT sent, reply lost     committed OR rolled back  GRANTED  set     SENT    SENT      "failed" (maybe)   BAD
after COMMIT returned       committed                 GRANTED  set     SENT    SENT      error page         ok*`, "failure matrix of the shipped handler"),
        p("Each row is a different inconsistency, and each one reaches a different team: support (free access), finance (receipts without payment), the certificate service (an enrollment that does not exist). The last row has an asterisk: everything is consistent, but if the reply to the learner is lost, the app shows an error for a purchase that succeeded, and the learner may click again. That is why purchases carry a `purchaseId` chosen by the client: a retry can be recognised instead of charged twice."),
        callout("warning", "A failed COMMIT is not always a rolled-back transaction",
            "When COMMIT returns an error from the server - a serialization failure, a deferred constraint violation, the session was already terminated as above - the transaction did not commit. When the connection breaks while COMMIT is in flight (\"Connection terminated unexpectedly\", a TCP reset, a failover), the outcome is unknown: the server may have written the commit record just before the connection died. The only safe reaction is to look: query by the purchase's own key (SELECT ... FROM enrollments WHERE purchase_id = $1) before answering or retrying."),

        h2("4. Worked example: shrink the transaction to what it can protect"),
        p("The first repair is to separate the two kinds of work. Everything that only touches PostgreSQL goes into a short transaction on one connection. Nothing that waits on another system runs while the transaction is open. Reads that do not need to be inside (the course price from the catalog) happen before it."),
        code("typescript", `
import { Pool } from "pg";
const pool = new Pool();

export async function buyCourse(userId: number, courseId: number, purchaseId: string) {
    const course = await catalog.getCourse(courseId);          // before BEGIN: no lock held while waiting

    const client = await pool.connect();
    let enrollmentId: number;
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '2s'");
        const { rows: [user] } = await client.query(
            "SELECT points FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (user.points < course.pricePoints) throw new InsufficientPoints();
        await client.query("UPDATE users SET points = points - $1 WHERE id = $2", [course.pricePoints, userId]);
        const { rows: [row] } = await client.query(
            \`INSERT INTO enrollments (user_id, course_id, purchase_id) VALUES ($1, $2, $3)
             ON CONFLICT (purchase_id) DO NOTHING RETURNING id\`, [userId, courseId, purchaseId]);
        if (!row) throw new DuplicatePurchase(purchaseId);    // a retry of a purchase that already committed
        enrollmentId = row.id;
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    // After COMMIT: the purchase is a fact. External effects follow it.
    await entitlements.grant(userId, courseId);
    await broker.publish("enrollments", { type: "EnrollmentCreated", enrollmentId, userId, courseId });
    await mailer.sendReceipt(userId, purchaseId);
    await redis.del(\`access:\${userId}:\${courseId}\`);         // invalidate; readers refill from the DB
    return { enrollmentId };
}`, "api/purchases.ts - step 1"),
        p("What changed, line by line against the failure matrix:"),
        bullets([
            "The transaction now lasts milliseconds, so it no longer trips `idle_in_transaction_session_timeout` and the row lock on the user is held only while rows are written. `lock_timeout` makes a stuck lock fail fast instead of piling up requests.",
            "A rollback can no longer leave free access, a ghost event or a receipt behind: none of them has happened yet when the rollback can occur.",
            "The cache is invalidated after commit instead of filled with a value that might never commit. Filling it from the request handler before commit lets other readers see a state that does not exist.",
            "`ON CONFLICT (purchase_id) DO NOTHING` (with a unique constraint on `purchase_id`) turns a client retry of a purchase that already committed into a recognisable case instead of a second charge.",
        ]),
        p("Now run the method again on the new code. The rows before `COMMIT` are clean. The rows after it are not: **if the process dies after `COMMIT` and before `broker.publish()`, the points are debited and the enrollment exists, but the access service, the certificate service and the receipt never hear about it.** The inconsistency moved; it did not disappear. This version is better - a missing event can be found by comparing tables, a ghost grant usually cannot - but it is not correct. Lesson 2 measures that gap, and lesson 3 closes it."),

        h2("5. How to verify where your boundary is"),
        numbered([
            "**Look for idle transactions in production.** Sessions that wait on the network inside a transaction show up as `idle in transaction`: `SELECT pid, now() - xact_start AS open_for, state, query FROM pg_stat_activity WHERE state = 'idle in transaction' ORDER BY open_for DESC;` Any row older than a few hundred milliseconds is a handler doing I/O between BEGIN and COMMIT.",
            "**Read the code for calls between BEGIN and COMMIT.** Every `await` inside the block that is not a query on the same client is a side effect outside the boundary. So is every `pool.query` - it uses another connection.",
            "**Inject failures at each step in a test.** Wrap each external client in a fake that can throw (or simulate a crash) at call N, run the purchase once per N, and assert one invariant after each run: points debited if and only if an enrollment exists, and no grant, event or receipt for an enrollment that does not exist.",
            "**Compare systems.** Count grants in the access service that have no enrollment row, and enrollments that have no grant. With the shipped handler the first number is not zero; with step 1 the second one can be. Lesson 10 turns this comparison into a repair job.",
        ]),
        p("Check your reading of the boundary on three more pieces of evidence from the same codebase:"),
        challenge("chal_quiz_dce_111"),

        h2("6. Pitfalls"),
        bullets([
            "**Believing ROLLBACK undoes external calls.** It undoes rows on one connection. Detect it: list every `await` between `BEGIN` and `COMMIT` that is not on the transaction's client.",
            "**`pool.query` inside a transaction block.** It looks transactional because of where it sits in the code. Detect it: in a test, throw after that statement and check whether its row survived the rollback.",
            "**Network I/O while holding row locks.** Throughput for one user collapses and timeouts kill sessions. Detect it: `idle in transaction` sessions and long lock waits in `pg_stat_activity` / `pg_locks`.",
            "**Treating every COMMIT error as \"nothing happened\".** A connection lost during COMMIT is an unknown outcome. Detect it: grep the error handling around COMMIT for messages like \"you were not charged\" and check that the code queries by a business key before saying so.",
            "**Filling a cache from inside the transaction.** Other readers see data that may never commit. Detect it: any cache write that runs before `COMMIT` returns.",
            "**Reading id gaps as data loss.** Sequences are not transactional. Detect real loss with a business key (the purchase id), not with gaps in a surrogate id.",
        ]),

        h2("7. Checklist"),
        bullets([
            "Every transaction contains only statements on its own connection to one database; nothing between BEGIN and COMMIT waits on another system.",
            "Reads that do not need locks happen before BEGIN; the transaction is short, with `lock_timeout` and `idle_in_transaction_session_timeout` as guard rails.",
            "For every side effect you can say: what survives if the process dies right after it, and who repairs it.",
            "A COMMIT that ends in a connection error is treated as unknown and resolved by querying a business key.",
            "Retries of the same business action are recognisable (a client-chosen id with a unique constraint).",
            "You know the remaining gap: the effects after COMMIT can be lost. The next two lessons close it.",
        ]),

        callout("info", "Practice on your own (not graded)",
            "Pick one endpoint in a service you know that writes to its database and also calls something else (an email, a webhook, a cache, a queue). Write its failure matrix like the one in section 3: one row per line, one column per system, the state that survives a crash after that line. Mark the rows that are inconsistent, and for each one name the person or job that would notice it today - if nobody would, that is the first thing to fix."),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation, Tutorial section \"Transactions\" and chapter \"Concurrency Control\" (what a transaction makes atomic and visible).",
            "PostgreSQL documentation, \"Sequence Manipulation Functions\" (nextval is never rolled back) and the SQL command reference for \"NOTIFY\" (notifications are delivered only when the transaction commits).",
            "PostgreSQL documentation, \"Client Connection Defaults\": idle_in_transaction_session_timeout, lock_timeout and statement_timeout.",
        ]),
    ],
});
