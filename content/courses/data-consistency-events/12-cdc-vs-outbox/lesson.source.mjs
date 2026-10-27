// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-4-3",
    title: "Change data capture or outbox?",
    slug: { _type: "slug", current: "change-data-capture-or-outbox" },
    description:
        "A one-week spike replaced the enrollment outbox with change data capture on the enrollments table. It worked, until a weekend outage of the connector filled the primary's disk with retained WAL, and a column rename silently stopped certificates. Learn what log-based CDC (PostgreSQL logical decoding, Debezium) guarantees and what a transactional outbox guarantees, where each one couples you to what, what each costs to operate, what ordering each gives, and why the common answer is both: an outbox table, captured by CDC.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the platform team, CodeDev learning platform",
        problem:
            "The data team proposed to delete the outbox code: \"Debezium already reads every change from PostgreSQL, we can stream the enrollments table directly.\" A spike ran for one week with the certificate service consuming the enrollments CDC topic. On Saturday the Kafka Connect cluster was down for 31 hours after a certificate expired; on Sunday evening the primary database's disk reached 92% and paged the on-call engineer. On Monday a pull request renamed enrollments.status to state; the review approved it as an internal change. The certificate service issued no certificates for six hours, with no error in its logs.",
    },

    content: [
        h2("1. The incident: no dual write, three new problems"),
        p("The proposal was reasonable. The outbox (lessons 1.3 and 2.1) asks every write path to insert an event row in the same transaction, and a publisher to move those rows to the broker. Change data capture promises the same guarantee with no code at all: the database already records every committed change in its write-ahead log, so a connector can read that log and publish each change. No dual write, no forgotten event, even manual SQL is captured."),
        p("The spike delivered that. It also delivered three things the proposal did not mention: a database disk filling up while the connector was down, a column rename that became a breaking API change, and consumers that saw changes to two tables in an order that never happened in the database. None of them is a bug in the connector. They are what CDC is."),

        h2("2. Read the evidence"),
        p("Sunday, 21:40. PostgreSQL keeps every WAL segment a logical replication slot has not confirmed yet. With the connector down, nobody confirmed anything for 31 hours:"),
        code("sql", `
SELECT slot_name, plugin, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS retained_wal
FROM pg_replication_slots
WHERE slot_type = 'logical';

   slot_name    |  plugin  | active | retained_wal
----------------+----------+--------+--------------
 debezium_codedev | pgoutput | f      | 187 GB`, "psql on the primary, Sunday 21:40"),
        p("Monday, 14:05. The rename was merged as an internal refactor. The CDC events changed shape at once, and the certificate service read a field that no longer existed:"),
        code("json", `
{
  "op": "u",
  "before": { "id": "e_9931", "state": "active",    "completed_at": null },
  "after":  { "id": "e_9931", "state": "completed", "completed_at": "2026-10-26T14:07:51Z" },
  "source": { "table": "enrollments", "lsn": 91827364 }
}`, "codedev.public.enrollments, a change event after the rename (simplified)"),
        code("text", `
certificate-service 14:00-20:00  certificates_issued_total +0   (same hours last week: +236)
certificate-service logs since 14:05: 0 WARN, 0 ERROR`, "metrics and logs"),
        p("The consumer checked `msg.after.status === \"completed\"`. After the rename `status` is `undefined`, the condition is false, and nothing complains. The enrollment team did not change any event: from their point of view, they renamed a column in their own table."),

        h2("3. What each one actually guarantees"),
        h3("Log-based change data capture"),
        p("PostgreSQL writes every change to the write-ahead log (WAL) before it commits. With `wal_level = logical`, it can **decode** that log into row changes and stream them through a **replication slot** to a client; the built-in `pgoutput` plugin is what logical replication uses. Debezium's PostgreSQL connector is a common such client: it runs in Kafka Connect and writes the changes to Kafka topics (check the current Debezium docs for exact settings and defaults). What you get:"),
        bullets([
            "**Every committed change, and only committed ones**, decoded in commit order per slot. A rolled-back transaction produces nothing. No dual write anywhere.",
            "**Every writer is covered**: the application, a migration, a support engineer's manual `UPDATE`. That is a real advantage for audit, search indexes and analytics.",
            "**No application code**, which is also the catch: nobody in the application decided what the message means.",
            "**At-least-once delivery to the broker.** After a connector restart it can re-send changes it already published. Consumers still need the inbox of lesson 2.2.",
        ]),
        h3("Transactional outbox"),
        p("The application inserts an explicit event row in the same transaction as the business change (lesson 1.3), and a publisher sends it (lesson 2.1). What you get:"),
        bullets([
            "**An event designed for its readers**: `EnrollmentCompleted { enrollmentId, userId, courseId, completedAt, version }`, documented and versioned (lesson 5.1), independent of how the table looks.",
            "**Intent, not just a diff.** \"Enrollment cancelled because the payment was refunded\" is one event with a reason. A row change says only that a column went from `active` to `cancelled`.",
            "**A key and a topic you choose**, for example every event of one enrollment keyed by its id on one topic.",
            "**Only the writes that go through the code.** A manual `UPDATE` emits nothing. That is the gap reconciliation (lesson 4.2) covers.",
        ]),

        h2("4. Coupling, cost, ordering"),
        h3("Schema coupling"),
        p("With CDC on business tables, **the table is the API**. Every consumer depends on column names, types and meanings, and on columns it should never see (internal notes, prices, personal data that now flows to every subscriber). A refactor in the owning service becomes a cross-team breaking change, and the owning team usually does not even know who reads its tables. With an outbox, the table stays private and the event is the contract."),
        h3("Operational cost"),
        bullets([
            "**CDC**: `wal_level = logical` on the primary, a replication slot per connector, a Kafka Connect cluster to run, upgrade and monitor. The slot is the sharp edge: while the connector is down or slow, the primary keeps WAL for it, and an abandoned slot fills the disk. Since PostgreSQL 13, `max_slot_wal_keep_size` caps the retained WAL; past the cap the slot is invalidated and the connector needs a new snapshot - a choice between disk safety and losing your place. Slots and failover need care too: check how your PostgreSQL version and your managed service handle logical slots on a standby before you rely on them.",
            "**Outbox**: one more table and one more `INSERT` per business write, a publisher process, and cleanup of published rows (a busy outbox table needs regular deletes and vacuum, or it bloats). A polling publisher adds query load and some latency.",
        ]),
        h3("Ordering"),
        p("Logical decoding gives changes in commit order, but by default a CDC connector writes each table to its own topic, keyed by primary key. Order then holds per row, within one partition. Across two tables - an enrollment inserted, then its payment refunded - a consumer reading both topics can see the refund first. With an outbox you put both events on one topic with the enrollment id as key, and order per aggregate (lesson 3.1) is preserved."),

        h2("5. The usual answer: an outbox, captured by CDC"),
        p("The two are not rivals. The outbox decides **what** is published (an explicit event, a chosen key, a version); CDC can decide **how** it leaves the database (reading the outbox table's inserts from the WAL instead of polling it). Debezium ships an outbox event router for exactly this; check its current documentation for the expected table shape and configuration. The CodeDev setup after the spike:"),
        code("sql", `
-- the outbox stays the contract; CDC only reads this one table
CREATE TABLE outbox (
    id             uuid PRIMARY KEY,
    aggregate_type text        NOT NULL,          -- 'enrollment'
    aggregate_id   text        NOT NULL,          -- becomes the message key: order per enrollment
    event_type     text        NOT NULL,          -- 'EnrollmentCompleted'
    payload        jsonb       NOT NULL,          -- the versioned event, not the row
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- publish only the outbox table, inserts only, to the logical decoding client
CREATE PUBLICATION codedev_outbox FOR TABLE outbox WITH (publish = 'insert');

-- the slot must not take the primary down with it
ALTER SYSTEM SET max_slot_wal_keep_size = '50GB';
SELECT pg_reload_conf();`, "migration"),
        p("Because only inserts are published, the application can delete outbox rows soon after they are written (the WAL already holds them), which removes the cleanup problem of a polling publisher. The business tables stay private, the event contract is explicit, and the publisher has no polling loop."),
        callout("info", "When plain CDC on a table is the right tool",
            "Copying data into a warehouse, a search index or a cache, where the reader really wants \"the current rows of this table\" and is owned by the same team or accepts the table as its contract. A legacy application you cannot change to write an outbox. In those cases, treat the captured tables as a published schema: list the consumers, review migrations against them, and expose only the columns you mean to share."),
        h3("Choosing, in one list"),
        bullets([
            "**Events between services, with business meaning** (a saga step, a certificate trigger): outbox. Transport by polling or by CDC on the outbox table.",
            "**Replicating table state to analytics, search or a cache**: CDC on the tables, with the schema treated as a contract.",
            "**You cannot change the writer**: CDC, plus a translation step that turns row changes into events before other teams consume them.",
            "**One small database, one consumer, low volume**: a polling outbox publisher is simpler to run than a Connect cluster.",
        ]),

        challenge("chal_quiz_dce_431"),

        h2("6. How to verify"),
        bullets([
            "**Slot health, continuously.** Alert on `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)` per logical slot, on `active = false` for more than a few minutes, and on `wal_status` turning `unreserved` (WAL is about to be removed) or `lost` (`max_slot_wal_keep_size` invalidated the slot).",
            "**Kill the connector in staging.** Stop it for an hour under load, watch the retained WAL grow, start it again and count duplicates on the consumer side: the inbox must absorb them.",
            "**Schema changes against consumers.** With CDC on business tables, run every migration of those tables through a check that lists the columns consumers read. With an outbox, a contract test on the event payload (lesson 5.1) is enough, and table migrations are free.",
            "**Order per aggregate.** Produce a create and a cancel for the same enrollment within milliseconds, many times, and assert the consumer never sees the cancel first. It passes with one topic and one key per aggregate; with one topic per table it will fail eventually.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Treating business tables as private while CDC publishes them.** Spot it: a migration review that does not know which topics carry this table, or a consumer that reads `after.<column>` of another team's table.",
            "**A replication slot with nobody watching it.** Spot it: `pg_replication_slots` shows an inactive logical slot, or no alert exists on retained WAL; an old spike's slot left behind is the classic disk-full incident.",
            "**Assuming commit order across topics.** Spot it: a consumer that joins events from two table topics and \"waits for the other one\" with a timeout, or code that breaks when a refund arrives before the enrollment.",
            "**Believing CDC means exactly once.** Spot it: consumers without deduplication because \"Debezium reads the WAL\"; the connector re-sends after a restart.",
            "**Dropping the outbox to save one INSERT.** You lose the explicit contract, the intent and the choice of key, and gain a schema coupling. Spot it: an architecture decision that compares only lines of code.",
        ]),

        h2("8. Summary"),
        bullets([
            "Both close the dual-write gap. CDC captures every committed row change from the log, from any writer, with no application code; an outbox publishes an explicit, versioned event that carries intent and a key you choose.",
            "CDC on business tables makes the table schema a public contract and gives order only per table and key; it also needs a replication slot that can fill the primary's disk. An outbox needs one more insert per write, a publisher and cleanup.",
            "For events between services, keep the outbox and let CDC (or a poller) move it; use table-level CDC for replicating state to analytics, search and caches, and treat those tables as published schemas.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Logical Replication - https://www.postgresql.org/docs/current/logical-replication.html; Logical Decoding and replication slots; max_slot_wal_keep_size (PostgreSQL 13 and later).",
            "Chris Richardson, Pattern: Transactional outbox - https://microservices.io/patterns/data/transactional-outbox.html (polling publisher and transaction log tailing).",
            "Debezium documentation: PostgreSQL connector and the outbox event router (check the current version's docs for configuration, topic naming and delivery guarantees).",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write a one-page ADR for CodeDev: \"Enrollment events: outbox, with CDC as transport\". List the consumers, the event contract, the slot alerts and the retained-WAL cap, and what you would do if the slot is invalidated (how the connector resumes, and how reconciliation from lesson 4.2 finds what was missed)."),
    ],
});
