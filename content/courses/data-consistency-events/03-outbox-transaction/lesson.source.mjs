// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-1-3",
    title: "A transactional outbox: the event in the same commit",
    slug: { _type: "slug", current: "transactional-outbox-event-in-same-commit" },
    description:
        "The wallet team adopted the outbox and the leaderboard started showing points that no wallet has: the outbox row was saved through a repository bound to another connection, so it committed on its own while the wallet transaction rolled back. Learn what \"same transaction\" means in code (one connection, one transaction handle), design the outbox table (event id, aggregate, type, payload, write order, status), validate before writing, emit several events from one command in a reliable order, and test that a command is either fully committed with its events or not at all.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, wallet and points team, CodeDev learning platform",
        problem:
            "Thursday 29 October. After the enrollment incident the wallet service moved to a transactional outbox too: awarding points writes the new balance and a points.awarded row in the outbox, and the relay publishes it to the leaderboard. Three days later the weekly leaderboard shows 41 learners with more points than their wallet holds, by exactly the amount of an award they never received. Every one of those awards hit a deadlock or a validation error and was rolled back, yet its points.awarded event was published.",
    },

    content: [
        h2("1. The incident: an outbox that commits on its own"),
        p("The NestJS service injects two TypeORM repositories and opens a transaction for the award. It reads like a textbook outbox:"),
        code("typescript", `
// wallet/points.service.ts (release 2026.10.26-4)
@Injectable()
export class PointsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OutboxEvent) private readonly outbox: Repository<OutboxEvent>,
  ) {}

  async award(userId: string, amount: number, reason: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOneOrFail(Wallet, { where: { userId }, lock: { mode: "pessimistic_write" } });
      wallet.points += amount;
      await this.outbox.save({                        // <- the injected repository
        aggregateType: "wallet", aggregateId: userId,
        eventType: "points.awarded", payload: { userId, amount, reason, balance: wallet.points },
      });
      if (wallet.points > MAX_POINTS) throw new BadRequestException("balance cap reached");
      await manager.save(wallet);
    });
  }
}`, "points.service.ts"),
        p("The transaction callback receives `manager`, an `EntityManager` bound to the one connection that runs `BEGIN ... COMMIT`. `this.outbox` is a repository bound to the **data source**: each call takes its own connection from the pool and runs in autocommit mode. The wallet update and the outbox insert look like neighbours in the code; in PostgreSQL they are two transactions."),

        h2("2. Read the evidence"),
        p("With `log_line_prefix = '%m [%p] xid=%x '` (time, backend PID, transaction id) and statement logging switched on for the wallet database, one failed award looks like this:"),
        code("text", `
09:14:03.101 [41877] xid=0      LOG:  statement: BEGIN
09:14:03.103 [41877] xid=0      LOG:  statement: SELECT ... FROM wallets WHERE user_id = 'u_3121' FOR UPDATE
09:14:03.106 [41902] xid=0      LOG:  statement: INSERT INTO outbox (...) VALUES (..., 'points.awarded', ...)
09:14:03.107 [41877] xid=918244 LOG:  statement: UPDATE wallets SET points = 1300 WHERE user_id = 'u_3121'
09:14:04.108 [41877] xid=918244 ERROR:  deadlock detected
09:14:04.108 [41877] xid=918244 LOG:  statement: ROLLBACK`, "postgresql.log, wallet database"),
        bullets([
            "The `BEGIN`, the `SELECT ... FOR UPDATE`, the `UPDATE` and the `ROLLBACK` all run on backend **41877**. That is the transaction.",
            "The `INSERT INTO outbox` runs on backend **41902**, with no `BEGIN` before it: a single-statement transaction that committed the moment it finished, a millisecond before the deadlock.",
            "The relay found a pending row, published `points.awarded` with `balance: 1300`, and the leaderboard applied it. The wallet still says 1000.",
        ]),
        code("sql", `
-- Outbox rows whose award never reached the wallet (wallet database)
SELECT o.id, o.aggregate_id AS user_id, (o.payload->>'balance')::int AS event_balance, w.points AS wallet_points
FROM   outbox o
JOIN   wallets w ON w.user_id = o.aggregate_id
WHERE  o.event_type = 'points.awarded'
  AND  o.created_at >= '2026-10-26'
  AND  NOT EXISTS (SELECT 1 FROM points_ledger l WHERE l.event_id = o.id);
-- 41 rows: one per ghost award`, "ghost-awards.sql"),
        p("The same bug has a second face. If the outbox save had run **after** the transaction instead of inside the callback, a crash between them would lose the event: the lost-event incident of lesson 1.2. An outbox only works when the business change and the outbox row are written by the **same transaction on the same connection**."),

        h2("3. Core idea: one transaction, one handle"),
        p("The transactional outbox replaces \"write the database, then talk to the broker\" with \"write the database twice, in one commit\": the business rows and one outbox row per event. A relay (lesson 2.1) publishes the outbox later. Everything that makes it correct happens inside the command:"),
        numbered([
            "**Every write goes through the transaction handle.** With node-postgres that is the `PoolClient` that ran `BEGIN`; with TypeORM the `manager` passed to the callback (`manager.save`, `manager.getRepository(OutboxEvent)`); with Prisma the `tx` of `$transaction`; with Kysely the `trx`. An injected repository, a second `pool.query` or a helper that opens its own connection is a separate transaction, whatever the indentation says.",
            "**Validate before you write, and reject by throwing.** A failed check must roll back everything the command did. Returning early from the callback after a partial write commits the partial write. Ids are taken after validation; like any PostgreSQL sequence, an id taken by a transaction that rolls back is gone, so ids can have gaps and nobody should rely on them being contiguous.",
            "**One command may emit several events, in a defined order.** Completing the last lesson emits `lesson.completed` and then `course.completed`. Consumers will apply them in the order the relay publishes them, so the outbox needs a column that records the write order. `created_at DEFAULT now()` is **not** that column: `now()` returns the start time of the transaction, so every row of one command gets the same timestamp. Use a `bigserial` sequence column.",
            "**The event carries what consumers need.** The payload is a fact (\"300 points awarded, balance 1300\"), not a pointer that makes every consumer call back. The outbox row's id is the event id on the wire, the id consumers deduplicate on.",
        ]),
        h3("The table"),
        code("sql", `
CREATE TABLE outbox (
  seq            bigserial   PRIMARY KEY,          -- write order, read by the relay
  id             uuid        NOT NULL UNIQUE,      -- event id = message id, consumers dedupe on it
  aggregate_type text        NOT NULL,             -- 'wallet', 'enrollment', 'course'
  aggregate_id   text        NOT NULL,             -- the partition / ordering key (lesson 3.1)
  event_type     text        NOT NULL,             -- 'points.awarded'
  payload        jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  sent_at        timestamptz
);
-- The relay only ever looks for pending rows, oldest first.
CREATE INDEX outbox_pending ON outbox (seq) WHERE status = 'pending';`, "outbox.sql"),
        callout("info", "Write order is not commit order",
            "Within one transaction, seq follows the order of the INSERTs. Across concurrent transactions it does not follow the commit order: a transaction can take seq 41, commit after the one that took seq 42, and a relay that already moved past 42 could skip 41. Ordering per aggregate and safe relays are the subject of lessons 2.1 and 3.1; for now, never assume seq is gap-free or committed in order."),
        h3("When not to use an outbox"),
        bullets([
            "**Nobody outside the database needs the event.** If the only reaction to a lesson completion is updating a progress table in the same database, do it in the same transaction; an event adds a delay and a moving part for nothing.",
            "**Losing the message is fine.** Best-effort notifications (analytics, a cache warm-up) can be published after the commit, with the failure logged.",
            "**You already run CDC on the table.** If a connector streams committed row changes and consumers are happy with row-shaped events, the outbox may be redundant (lesson 4.3 compares them).",
        ]),
        p("An outbox is not free: every command writes one more row per event, the table must be cleaned up (delete or partition sent rows) and the relay is a process to run and monitor. The payoff is that a command is atomic again, including its effects on the rest of the platform."),
        challenge("chal_quiz_dce_131"),

        h2("4. Worked example: completing a lesson"),
        p("Here is a different command from the challenge, written with node-postgres. Completing a lesson records progress and emits `lesson.completed`; completing the **last** lesson of a course also emits `course.completed`, after it. Notice where validation happens, which object every query goes through, and how a rejection leaves nothing behind:"),
        code("typescript", `
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export class Rejected extends Error {}

async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();          // one connection for the whole command
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");             // a Rejected, a deadlock or a bug: nothing stays
    throw err;
  } finally {
    client.release();
  }
}

async function addEvent(client: PoolClient, aggregateType: string, aggregateId: string,
                        eventType: string, payload: object): Promise<void> {
  await client.query(
    "INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload) VALUES ($1, $2, $3, $4, $5)",
    [randomUUID(), aggregateType, aggregateId, eventType, JSON.stringify(payload)],
  );
}

export function completeLesson(pool: Pool, userId: string, lessonId: string): Promise<void> {
  return withTransaction(pool, async (client) => {
    // 1. Validate, with the rows we depend on locked.
    const lesson = await client.query(
      "SELECT course_id FROM lessons WHERE id = $1", [lessonId]);
    if (lesson.rowCount === 0) throw new Rejected("unknown lesson");
    const courseId: string = lesson.rows[0].course_id;
    const enrolled = await client.query(
      "SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2 FOR UPDATE", [userId, courseId]);
    if (enrolled.rowCount === 0) throw new Rejected("not enrolled");

    // 2. The business change. ON CONFLICT: completing a lesson twice is not an error, and emits nothing.
    const inserted = await client.query(
      "INSERT INTO lesson_progress (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, lessonId]);
    if (inserted.rowCount === 0) return;

    // 3. The events, in the order consumers must apply them.
    await addEvent(client, "enrollment", \`\${userId}:\${courseId}\`, "lesson.completed", { userId, courseId, lessonId });
    const left = await client.query(
      \`SELECT count(*)::int AS n FROM lessons l
       WHERE l.course_id = $1
         AND NOT EXISTS (SELECT 1 FROM lesson_progress p WHERE p.user_id = $2 AND p.lesson_id = l.id)\`,
      [courseId, userId]);
    if (left.rows[0].n === 0) {
      await addEvent(client, "enrollment", \`\${userId}:\${courseId}\`, "course.completed", { userId, courseId });
    }
  });
}`, "progress/complete-lesson.ts"),
        p("Three details carry the correctness. Every query uses `client`, never `pool`, so `BEGIN ... COMMIT` covers the progress row and both outbox rows. The duplicate case returns **before** any write, so returning is safe there; every real failure throws, so the `catch` rolls back. And the two events come from one transaction in a fixed order, read back by the relay in `seq` order."),

        h2("5. The challenge"),
        p("The challenge implements two commands of the platform with the same rules, on an in-memory database: `db.tx(fn)` runs `fn` on a copy of the tables and commits only if it returns without throwing. `placeEnrollment` emits `enrollment.created` and, when the learner took the last seat, `course.full`. `awardPoints` emits `points.awarded` and one `level.reached` per level crossed. The test runner crashes the process before or after some commits and prints every table at the end, so a command that is half-written, writes an event for a rejected command or loses an event shows up in the output."),
        challenge("chal_coding_dce_132"),

        h2("6. How to verify"),
        bullets([
            "**Same backend, same xid.** In a staging database, log statements with `%p` and `%x` in `log_line_prefix` and run each command once. The business `UPDATE` and the `INSERT INTO outbox` must show the same PID and the same transaction id; a different PID is a separate transaction.",
            "**A rollback test per command.** Force each failure path (validation, a constraint violation, an exception thrown after the outbox insert) and assert that the outbox has no new row. Force a crash after COMMIT and assert that both the business row and its outbox rows exist.",
            "**An invariant query.** For an aggregate with a ledger, every `points.awarded` row must have its ledger row and vice versa; the ghost query of section 2 should return zero rows, every day.",
            "**Order within a command.** Assert the `event_type` sequence of the rows a command wrote, ordered by `seq`, not by `created_at`.",
        ]),
        code("sql", `
-- Ledger entries without an event, and events without a ledger entry: both must be 0
SELECT count(*) FILTER (WHERE o.id IS NULL) AS awards_without_event,
       count(*) FILTER (WHERE l.event_id IS NULL) AS events_without_award
FROM   points_ledger l
FULL   JOIN (SELECT id FROM outbox WHERE event_type = 'points.awarded') o ON o.id = l.event_id;`, "invariant.sql"),

        h2("7. Common mistakes"),
        bullets([
            "**A repository or client that is not the transaction's.** Injected repositories, a module-level `pool.query`, a logging helper that writes to the database: each is its own transaction. Spot it: grep the command for `this.<repo>` and `pool.` inside the callback; check PIDs in the log.",
            "**Writing first, validating later, returning instead of throwing.** A check after the writes that does `return` commits whatever was written. Spot it: every rejection path is a `throw`, and a test asserts the outbox is unchanged after each one.",
            "**Ordering by `created_at`.** With `DEFAULT now()` all rows of one transaction share a timestamp, so two events of one command come back in arbitrary order. Spot it: a test with two events from one command, ordered by `created_at`, that fails now and then.",
            "**Payloads that point instead of state.** `{ userId }` alone forces every consumer to call the wallet API, which by then may show a later balance. Spot it: ask whether a consumer could act on the event while the wallet service is down.",
            "**Publishing from the command \"just this once\".** Calling the broker directly after the commit for a \"faster\" path brings the dual write back. Spot it: the command code must contain no broker client at all.",
        ]),

        h2("8. Summary"),
        numbered([
            "An outbox works only when the business change and the outbox rows are written through the same transaction handle; an injected repository or a second pool query commits separately and brings back ghost or lost events.",
            "Validate first and reject by throwing so the whole command rolls back; take ids after validation and accept gaps; order several events of one command with a sequence column, not `now()`.",
            "Verify with same-PID/same-xid logs, a rollback test for every failure path, a crash-after-commit test and a daily invariant query between business rows and outbox rows.",
        ]),

        h2("Sources"),
        bullets([
            "Chris Richardson, Pattern: Transactional outbox - microservices.io/patterns/data/transactional-outbox.html",
            "PostgreSQL documentation: Date/Time Functions, Current Date/Time (now() is the transaction start time, clock_timestamp() is not) - postgresql.org/docs/current/functions-datetime.html",
            "node-postgres documentation: Transactions (use the same client for every query) - node-postgres.com/features/transactions",
        ]),
    ],
});
