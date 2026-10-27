// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-dce-5-1",
    title: "Evolving event schemas without breaking consumers",
    slug: { _type: "slug", current: "evolving-event-schemas-without-breaking-consumers" },
    description:
        "One pull request renamed userId to learnerId and turned percent from 0-100 into a 0-1 fraction in the ProgressRecorded event. The leaderboard consumer sent every new event to its dead-letter queue, and the certificate service stopped issuing certificates without a single error. Learn why an event is a contract that outlives its code, which changes are additive, how tolerant readers and upcasters keep old and new events in one code path, what a schema registry does and does not check, why a field name must never get a new meaning, and how to retire an event type.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the learning-progress team, CodeDev learning platform",
        problem:
            "Tuesday 11:05, release 2026.10.3 of the progress service goes out with a \"cleanup\" of the ProgressRecorded event: userId is renamed to learnerId to match the new naming guide, and percent becomes a fraction between 0 and 1 because the new mobile progress ring wants it that way. By 11:20 the leaderboard consumer's dead-letter queue holds 3,914 messages. Nothing alerts on the certificate service: its logs are clean, but it has issued zero certificates since 11:05, against about 40 an hour normally. On Wednesday the data team replays the progress topic from offset 0 to rebuild a read model, and the new consumer code they deployed for it crashes on the first event from 2025.",
    },

    content: [
        h2("1. The incident: a cleanup that broke two consumers in two different ways"),
        p("The progress service publishes `ProgressRecorded` through its outbox (lesson 1.3) every time a learner finishes a lesson. Three services consume it: the leaderboard, the certificate service and, since last month, a data-team read model. Here is the diff that shipped:"),
        code("typescript", `
 // progress/events.ts
 export interface ProgressRecorded {
   eventId: string;
   enrollmentId: string;
-  userId: string;
+  learnerId: string;          // naming guide: "learner", not "user"
   courseId: string;
-  percent: number;            // 0..100
+  percent: number;            // 0..1, the mobile ring wants a fraction
   occurredAt: string;
 }`, "progress/events.ts (diff of release 2026.10.3)"),
        p("The TypeScript compiler was happy: the producer and its own tests agree with themselves. The consumers live in other repositories, are deployed on their own schedule, and read bytes from a topic, not this interface. Each one failed differently:"),
        bullets([
            "**The leaderboard** validates every event and requires `userId`. Every new event fails validation and goes to the dead-letter queue. Loud, visible, nothing lost yet.",
            "**The certificate service** issues a certificate when `percent >= 100`. A fraction is never 100 or more, so the condition is simply never true. No error, no DLQ, no log line. Silent and much worse.",
            "**The replay on Wednesday** ran consumer code written against the new shape over events from 2025. Old events have `userId` and percentages up to 100, the code expected neither.",
        ]),

        h2("2. Read the evidence"),
        code("text", `
leaderboard-consumer  11:05:14  WARN  validation failed, sending to DLQ
  eventId=evt_9f31 type=ProgressRecorded
  issues=[{"path":["userId"],"message":"Required"}]
leaderboard-consumer  11:20:00  INFO  dlq.depth=3914

certificate-service   11:00-12:00  certificates_issued_total  +0   (same hour last week: +41)
certificate-service   logs since 11:05: 0 WARN, 0 ERROR`, "consumer logs and metrics, Tuesday"),
        p("Then look at what is actually in the topic. The outbox table keeps the payloads, so one query shows both shapes side by side:"),
        code("sql", `
SELECT event_type,
       payload ? 'userId'      AS has_user_id,
       payload ? 'learnerId'   AS has_learner_id,
       max((payload->>'percent')::numeric) AS max_percent,
       count(*)
FROM outbox
WHERE event_type = 'ProgressRecorded'
  AND created_at > now() - interval '2 days'
GROUP BY 1, 2, 3;

 event_type       | has_user_id | has_learner_id | max_percent | count
------------------+-------------+----------------+-------------+-------
 ProgressRecorded | t           | f              |         100 | 18822
 ProgressRecorded | f           | t              |           1 |  4417`, "psql, Tuesday 12:10"),
        p("Two shapes under one name, with nothing in the message telling a consumer which one it holds. The rename is a structural break a validator can catch. The new meaning of `percent` is a semantic break no validator can catch: `0.98` and `98` are both valid numbers."),

        h2("3. Why events are harder to change than APIs"),
        p("An HTTP API change has one moment of truth: the request. If the client and server disagree, the request fails now, and the client can be fixed and retried. An event has three properties that make every change riskier:"),
        bullets([
            "**Unknown readers.** The producer does not call its consumers; it does not even know all of them. The data team's read model was added without asking the progress team.",
            "**Independent deploys.** Producer and consumers ship on different days. For a while, old consumers read new events and new consumers read old events. Both directions must work.",
            "**A long memory.** Events sit in the outbox, in the broker's retention window, in a dead-letter queue, in an archive. Lesson 3.2 replays them from an offset. An event written in 2025 must still be readable by the code of 2027.",
        ]),
        p("That gives two kinds of compatibility, and for events you usually need both:"),
        bullets([
            "**Backward compatible**: new consumer code can read old events. Needed for replays, for DLQ redrives and for the window where old events are still in the topic.",
            "**Forward compatible**: old consumer code can read new events. Needed because the producer usually deploys first and consumers catch up later.",
        ]),
        callout("info", "When you do not need any of this",
            "If one team owns the producer and the only consumer, they deploy together, and the topic has a short retention with no replay, a coordinated change can be simpler than versioning. Be honest about the \"only consumer\" part: on CodeDev a third consumer appeared without the producer team knowing. The cheap protection, an explicit version field and a tolerant reader, is worth having even then."),

        h2("4. The rules of a safe change"),
        h3("Put the version in the envelope"),
        p("Every event carries a small envelope that never changes shape, and the payload inside it can evolve:"),
        code("json", `
{
  "eventId": "evt_9f31",
  "eventType": "ProgressRecorded",
  "eventVersion": 2,
  "occurredAt": "2026-10-20T11:05:14.220Z",
  "aggregateId": "enr_5512",
  "payload": { "enrollmentId": "enr_5512", "learnerId": "u_77", "courseId": "c_dce", "completedLessons": 11, "totalLessons": 15, "percent": 73 }
}`, "event envelope"),
        p("With a version number, a consumer can tell which shape it holds instead of guessing from which fields happen to exist. The outbox table stores it in its own column (`event_version`), so the publisher, the consumers and the SQL above can all filter on it."),
        h3("Additive changes only, within a version"),
        bullets([
            "**Safe**: adding an optional field that old consumers can ignore (`completedLessons`), adding a new event type, adding a new value to an enum only if every consumer has a default branch for unknown values.",
            "**Breaking**: removing or renaming a field, changing its type, making an optional field required, splitting one event into two, and changing what a field **means** or its unit.",
        ]),
        h3("Never reuse a field name with a new meaning"),
        p("This is the rule the certificate service paid for. If percent must become a fraction, it gets a new name, such as `progressRatio`, and `percent` keeps meaning 0-100 for as long as the version lives. Put units in names when they are not obvious: `amountMinor` (an integer in the smallest currency unit), `durationMs`, `percent`. A removed field's name is retired, not recycled: if `score` once meant raw points and is removed, a future \"weighted score\" is called `weightedScore`, never `score`, because a replay will still meet the old `score` events."),
        h3("A breaking change is a new version"),
        p("When a change cannot be additive, publish a new version and run both for a while. The producer writes both versions in the **same transaction**, as two outbox rows, so neither can exist without the other:"),
        code("typescript", `
await db.tx(async (tx) => {
  await tx.query("UPDATE enrollment_progress SET completed_lessons = $1 WHERE id = $2", [done, enrollmentId]);
  // v1 for consumers that have not migrated yet: same field names and meanings as before
  await tx.query(
    "INSERT INTO outbox (id, event_type, event_version, aggregate_id, payload) VALUES ($1, 'ProgressRecorded', 1, $2, $3)",
    [ids.next(), enrollmentId, { enrollmentId, userId: learnerId, courseId, percent }],
  );
  // v2: the new shape; percent is still 0..100, the fraction is a new field
  await tx.query(
    "INSERT INTO outbox (id, event_type, event_version, aggregate_id, payload) VALUES ($1, 'ProgressRecorded', 2, $2, $3)",
    [ids.next(), enrollmentId, { enrollmentId, learnerId, courseId, completedLessons: done, totalLessons: total, percent, progressRatio: done / total }],
  );
});`, "progress/recordProgress.ts"),
        p("Two variants exist: separate topics per version (`progress.recorded.v1`, `progress.recorded.v2`), which lets each consumer subscribe to exactly one, or one topic with the version in the envelope, which keeps per-key ordering across versions in one partition (lesson 3.1). Either works; pick one convention for the platform and write it down."),

        h2("5. Tolerant readers and upcasters"),
        p("Consumers need two habits. First, a **tolerant reader**: validate what you use, ignore what you do not know. The leaderboard rejected events because of a strict validator, but a validator that also rejected unknown fields would have broken on the harmless `completedLessons` addition too:"),
        code("typescript", `
import { z } from "zod";

// Too strict: .strict() rejects any field this consumer does not know,
// so even a purely additive producer change sends events to the DLQ.
const ProgressV1Strict = z.object({ enrollmentId: z.string(), userId: z.string(), courseId: z.string(), percent: z.number() }).strict();

// Tolerant: unknown keys are stripped (the default for z.object), required fields stay required.
const ProgressV1 = z.object({
  enrollmentId: z.string(),
  userId: z.string(),
  courseId: z.string(),
  percent: z.number().min(0).max(100),     // note: 0.98 passes this range check too - meaning is not checkable
});`, "leaderboard/schemas.ts"),
        p("Second, an **upcaster**: one function per version step that turns an old payload into the next shape, chained until it reaches the version the handler is written for. The handler only ever sees the current shape, and replays of 2025 events go through the same code path as today's events:"),
        code("typescript", `
const ProgressV2Schema = z.object({
  enrollmentId: z.string(),
  learnerId: z.string(),
  courseId: z.string(),
  percent: z.number().min(0).max(100),
  completedLessons: z.number().int().optional(),
  totalLessons: z.number().int().optional(),
});
type ProgressV2 = z.infer<typeof ProgressV2Schema>;
class UnknownVersionError extends Error {
  constructor(readonly version: number) { super(\`unknown ProgressRecorded version \${version}\`); }
}

const upcasters: Record<number, (payload: any) => any> = {
  1: (v1) => ({ enrollmentId: v1.enrollmentId, learnerId: v1.userId, courseId: v1.courseId, percent: v1.percent }), // v1 -> v2
};
const CURRENT = 2;

export function toCurrent(envelope: { eventVersion: number; payload: unknown }): ProgressV2 {
  if (envelope.eventVersion > CURRENT) {
    // a version from the future: this consumer is older than the producer. Do not guess.
    throw new UnknownVersionError(envelope.eventVersion);
  }
  let payload = envelope.payload;
  for (let v = envelope.eventVersion; v < CURRENT; v++) payload = upcasters[v](payload);
  return ProgressV2Schema.parse(payload);
}`, "certificates/upcast.ts"),
        bullets([
            "**Upcast on read, do not rewrite history.** The stored events stay as they were written. Kafka topics are append-only anyway, and the outbox rows are your audit trail. Rewriting them in place is a migration of every copy, everywhere, which you will not finish.",
            "**Upcasters are pure.** No database reads, no clock, no randomness: a replay must turn the same old event into the same new shape every time (lesson 3.2). If v2 needs data v1 does not have, make the new field optional instead of inventing it.",
            "**Unknown future versions are not guessed.** An old consumer that sees version 3 should stop and alert (or park the message), not process it as version 2.",
        ]),
        callout("warning", "A dual-published event is two events",
            "While v1 and v2 are both published, a consumer that subscribes to both would handle every change twice. Each consumer reads exactly one version; the inbox (lesson 2.2) deduplicates by eventId, and the two versions have different eventIds by design. Migrate a consumer by switching it from v1 to v2 in one deploy."),

        challenge("chal_quiz_dce_511"),

        h2("6. Schema registries: useful, and narrower than they look"),
        p("A schema registry stores the schema of each event type and version and checks every new schema against the old ones before it can be used. Confluent Schema Registry (Avro, Protobuf, JSON Schema), AWS Glue Schema Registry and Apicurio Registry are common choices; their compatibility modes (such as backward, forward, full, and transitive variants that check against all earlier versions, not just the last) and their client integrations differ, so check the documentation of the one you run. Without a registry, the same idea fits in a repository: keep the JSON Schema of every published version in a `contracts/` folder and let CI fail a pull request that edits a published version instead of adding a new one."),
        p("What a registry checks is **structure**: a field removed, a type changed, a required field added. What it cannot check is **meaning**. Changing percent from 0-100 to 0-1 keeps the type `number` and passes every compatibility mode. Changing an amount from VND to USD cents passes too. Those breaks are caught by naming discipline (section 4) and by contract tests that run real consumer code against real example events (section 8)."),

        h2("7. Deprecating an event type"),
        p("Versions accumulate. Retiring one is a small project with an order that matters:"),
        numbered([
            "**Announce.** Mark the version deprecated in the contract (a `deprecated: true` flag and a sunset date in the schema file) and tell the owners of every known consumer.",
            "**Measure who still reads it.** Per consumer group, track the last time it consumed the old version. On Kafka the consumer group offsets of a version-specific topic show it; with one topic, have consumers emit a metric labelled with `eventVersion`.",
            "**Stop publishing** only when no consumer has read the old version for an agreed period, and remove the second outbox insert in the same release.",
            "**Keep the upcaster.** Old events remain in archives and replays. The v1 to v2 upcaster lives as long as any v1 event can be read, which for an event-sourced store means forever.",
        ]),
        p("Deleting the old version from the producer the same day the new one ships is exactly the CodeDev incident with extra steps."),

        h2("8. How to verify"),
        bullets([
            "**Golden events.** Keep one real example JSON file per published version (`contracts/ProgressRecorded/v1.example.json`, `v2.example.json`). Each consumer has a test that runs `toCurrent` and its handler over every file. A new consumer, or a replay job, that cannot handle v1 fails in CI instead of on Wednesday.",
            "**A CI rule on the contracts folder.** A published version's schema file may only change by adding optional fields; anything else needs a new version file. A ten-line script that compares required fields and types is enough to start.",
            "**Per-version metrics.** Consumers count processed events by `eventType` and `eventVersion`, and count `UnknownVersionError` and validation failures separately from other errors. A DLQ that grows right after a producer deploy is the signal the leaderboard gave.",
            "**Business-level checks for semantics.** The certificate break was visible only as a drop in `certificates_issued_total`. A reconciliation query (lesson 4.2) that counts enrollments at 15 of 15 lessons without a certificate catches it whatever the cause.",
        ]),
        code("sql", `
-- learners who finished every lesson more than an hour ago and still have no certificate
SELECT e.id AS enrollment_id, e.user_id, e.course_id, p.completed_at
FROM enrollment e
JOIN enrollment_progress p ON p.enrollment_id = e.id
LEFT JOIN certificate c ON c.user_id = e.user_id AND c.course_id = e.course_id
WHERE p.completed_lessons = p.total_lessons
  AND p.completed_at < now() - interval '1 hour'
  AND c.id IS NULL;`, "reconciliation: completed without a certificate"),

        h2("9. Common mistakes"),
        bullets([
            "**Reusing a field name with a new meaning or unit.** Spot it in review: any diff that changes the comment, unit or range of an existing event field without changing its name.",
            "**Strict validation of unknown fields.** `.strict()`, `additionalProperties: false` or a class mapper that throws on unknown properties. Spot it by publishing a golden event with one extra field in a consumer test: it must still be processed.",
            "**No version in the message.** Consumers guess the shape from which fields exist (`payload.userId ?? payload.learnerId`). Spot it by grepping consumers for `??` chains over event fields; that is an upcaster without a version.",
            "**Removing the old version when the new one ships.** Spot it in the producer diff: the v1 outbox insert and the v2 insert should coexist for a release or more, with a sunset date in the contract.",
            "**Upcasters that read the database or the clock.** A replay then produces different results from the original run. Spot it by checking that every upcaster is a pure function of its input.",
        ]),

        h2("10. Summary"),
        bullets([
            "An event is a contract with unknown readers and a long memory: new code must read old events, old code must read new events, and a replay will meet every version you ever published.",
            "Change by addition inside a version; anything else is a new version, published alongside the old one in the same outbox transaction, with consumers using tolerant readers and pure upcasters.",
            "Registries and validators catch structural breaks; only naming discipline (never a new meaning for an old name), golden-event tests and business metrics catch semantic ones.",
        ]),

        h2("Sources"),
        bullets([
            "Transactional outbox pattern - microservices.io/patterns/data/transactional-outbox.html",
            "Confluent documentation: Schema Evolution and Compatibility (Schema Registry) - check the current version",
            "Greg Young, Versioning in an Event Sourced System (on upcasting and weak schemas)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one event your own system publishes. Write down its current version as a JSON example, then design version 2 for a change you expect (a renamed field or a new unit): the v1 and v2 examples, the upcaster, and the deprecation plan with a sunset date. Add a test that runs your consumer over both example files."),
    ],
});
