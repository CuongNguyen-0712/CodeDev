// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-bjm-3-2",
    title: "Dead-letter queues & redrive",
    slug: { _type: "slug", current: "dead-letter-queues-redrive" },
    description:
        "A dead-letter queue stops one bad message from blocking the others, but it only helps if you can get the messages out again safely. After a font fix, an engineer pressed \"redrive all\" on 1,189 dead certificate jobs: new certificates waited up to ten minutes, 41 learners got two certificates and three got one with an empty name. Learn what a DLQ entry must record, how to redrive by cause after a fix, at a rate the queue can absorb, without duplicates and without replaying payloads the code cannot read, and how to purge old entries without deleting the evidence.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev platform team (queues and workers)",
        problem:
            "Monday 08:12 a renderer release dropped the Inter Display font, and every certificate PDF failed with RenderError. Thanks to the dead-letter queue from lesson 3.1 the queue kept moving, and 1,184 certificate jobs were parked. At 09:52 the fix was deployed and at 09:55 an engineer clicked \"Redrive all\" in the queue console. By 10:10 support had three new kinds of tickets: certificates that took ten minutes, learners with two certificate emails, and a certificate with an empty name.",
    },

    content: [
        h2("1. The incident: a redrive that did three kinds of damage"),
        p("The DLQ did its job on Monday morning. Lesson 3.1 added `maxReceiveCount: 3` and a dead-letter queue to the certificate renderer, so when a release broke the font, each failing job was tried three times and parked, and certificates for other courses kept rendering. The trouble started when the messages came **back**. This is the console action that ran at 09:55:"),
        code("text", `
Redrive certificate-renderer-dlq -> certificate-renderer
  source messages:   1,189 (all)
  velocity:          system optimized (as fast as possible)
  started 09:55:02   finished 09:55:09`, "queue console, Start DLQ redrive"),
        p("Seven seconds to move 1,189 messages. What followed is in the evidence below. None of it was a bug in the renderer; all of it came from **how** the messages were moved back."),

        h2("2. The evidence"),
        h3("A. The DLQ, grouped by last error, before the redrive"),
        code("text", `
lastError                                           count  schema  first failure     last failure
RenderError: font "Inter Display" not found         1,184  v2      10-27 08:12       10-27 09:40
SchemaVersionError: unsupported payload version 1       3  v1      10-21 14:03       10-21 14:05
ValidationError: course c_404 does not exist            2  v2      10-25 10:31       10-25 10:33`, "codedev-queue dlq list certificate-renderer-dlq --group-by lastError"),
        h3("B. The main queue after the redrive"),
        code("text", `
time    waiting  oldest age   rendered/min
09:54       35       4 s           41
09:56    1,144     1 min 00 s     120
10:00      824     5 min 00 s     120
10:05      424    10 min 00 s     120
10:08      184     4 min 36 s     120
10:12       38       5 s           42`, "Grafana, Queues > certificate-renderer"),
        h3("C. Certificates sent twice"),
        code("sql", `
SELECT learner_id, course_id, count(*) AS certificates
FROM certificates
WHERE issued_at >= '2026-10-27 09:55'
GROUP BY learner_id, course_id
HAVING count(*) > 1;
-- 41 rows. For each: one certificate from the redriven message, one from a "Resend certificate"
-- click between 08:12 and 09:52 that created a new job with the same certificate id.`, "psql, certificates database"),
        h3("D. One rendered certificate"),
        code("text", `
cert_7d21  learner u_2290  course sql-data-modeling  payload v1 {"learner_name": "Mai Tran", "course": "..."}
renderer 1.14.2 reads payload.learnerName (v2 field) -> undefined -> PDF line "This certifies that  has completed"`, "renderer log, 09:55:06"),

        h2("3. Core idea: a DLQ is a parking lot with evidence"),
        p("A dead-letter queue is where messages go after `maxAttempts` failures, so that they stop blocking the queue (lesson 3.1) without being thrown away. Think of it as a parking lot with a ticket on every car: each entry must say **why** it is there, so that someone can decide what to do with it. Without that ticket the DLQ is just a slower way to lose data."),
        p("Record at least this with every dead letter:"),
        bullets([
            "**The original message**: id, body and **schema version**, unchanged. You need the exact bytes to replay or to debug.",
            "**attempts**: how many times it was tried. Three attempts with the same error is a poison message; one attempt is a classification decision (lesson 2.3).",
            "**firstFailedAt and lastFailedAt**: together they tell you whether it failed in a burst (a bad release at 08:12) or over days (a slow, recurring problem), and they drive retention.",
            "**lastError**: name and message. This is what you group by. The first error can be a passing timeout; the last one is why it finally gave up.",
            "**source queue** and, if you have it, the trace id of the original request.",
        ]),
        p("Evidence A shows why grouping by `lastError` matters: one DLQ, three completely different problems. Only one of them was fixed at 09:52."),
        h3("Redrive replays the message through today's code"),
        p("Redrive means moving messages from the DLQ back to the main queue so the workers process them again. That sentence hides four conditions, and the incident broke all four:"),
        numbered([
            "**Only after the cause is fixed, and only for that cause.** A message redriven before the fix just fails three more times. Select by `lastError` (or by ids from that group), never \"all\". Evidence A: only the RenderError group had a fix.",
            "**Only payloads the current code can read.** A message written with schema v1 in October meets code that reads v2 fields. If the code rejects it, it is merely wasted; if it reads it with the wrong field names, it produces a wrong result that no DLQ catches (evidence D). Check the schema version against what the consumer supports before moving anything, and leave the rest for a migration or a person.",
            "**At a rate the queue can absorb.** The renderer handles about 120 a minute with about 40 new messages a minute. Moving 1,189 in seven seconds put every new certificate behind the backlog, for up to ten minutes (evidence B). A rate of 50 a minute leaves room for live traffic and drains the backlog in about 24 minutes.",
            "**Never as a duplicate.** While the font was broken, learners clicked \"Resend certificate\" and the API created new jobs for the same certificate id. Those succeeded after 09:52, and then the redriven copies succeeded too (evidence C). Before moving a message, check that no message with the same id is already waiting in the main queue - and keep the consumer idempotent (lesson 2.1, and lesson 3.3 for side effects), because a check on the queue cannot see what was already processed.",
        ]),
        callout("info", "What the brokers give you",
            "SQS sets the DLQ with a redrive policy (maxReceiveCount) and moves messages back with a message move task, which accepts a maximum number of messages per second. BullMQ has no separate DLQ: failed jobs stay in the failed set with failedReason and attemptsMade, and you retry them with job.retry() or move them to a queue you call the DLQ. RabbitMQ uses a dead-letter exchange with x-death headers that count deaths per queue. In every case selection by cause, schema checks and duplicate checks are your code. Check the current docs of your broker for the exact API."),
        h3("When a DLQ is not the right tool"),
        bullets([
            "**When order per entity is part of correctness.** If message 2 for a learner only makes sense after message 1 (enrol, then complete), dead-lettering message 1 lets message 2 run on wrong state. Pause the entity's group instead and alert, or make the handler check the state it needs.",
            "**When the message has expired anyway.** A \"your session starts in 10 minutes\" reminder that failed for an hour should be dropped with a log line, not parked and replayed.",
            "**As a substitute for classifying errors.** A ValidationError will be in the DLQ forever. Fix the producer or reject the input at the API; the DLQ is the safety net, not the plan.",
        ]),

        challenge("chal_quiz_bjm_321"),

        h2("4. Worked example: a redrive endpoint you can trust"),
        p("The platform team replaced the console button with an admin endpoint that does the checks. A sketch in NestJS, using the queue client the workers already use:"),
        code("typescript", `
// apps/admin/src/queues/dlq.service.ts
type RedriveRequest = { queue: string; lastError?: string; ids?: string[]; perMinute: number };

@Injectable()
export class DlqService {
  constructor(private readonly queues: QueueClient, private readonly schemas: SchemaRegistry) {}

  async planRedrive(req: RedriveRequest): Promise<RedrivePlan> {
    if (!req.lastError === !req.ids?.length) throw new BadRequestException("give either ids or lastError");
    const dead = await this.queues.listDead(req.queue); // id, body, schema, attempts, firstFailedAt, lastFailedAt, lastError
    const selected = req.ids
      ? req.ids.map((id) => dead.find((d) => d.id === id) ?? { id, missing: true as const })
      : dead.filter((d) => d.lastError === req.lastError);

    const supported = this.schemas.supported(req.queue); // e.g. [2, 3]
    const plan: RedrivePlan = { move: [], refused: [] };
    for (const d of selected) {
      if ("missing" in d) plan.refused.push({ id: d.id, reason: "not in the DLQ" });
      else if (!supported.includes(d.schema)) plan.refused.push({ id: d.id, reason: \`schema v\${d.schema} is not supported\` });
      else plan.move.push(d.id);
    }
    return plan; // shown to the engineer before anything moves
  }

  /** Called once a minute by a scheduler while a redrive is running. */
  async redriveStep(queue: string, pending: string[], perMinute: number): Promise<string[]> {
    const batch = pending.splice(0, perMinute);
    for (const id of batch) {
      if (await this.queues.isWaiting(queue, id)) continue;         // already back in the main queue: leave it in the DLQ
      await this.queues.moveFromDead(queue, id, { resetAttempts: true });
    }
    return pending;
  }
}`, "dlq.service.ts"),
        p("Three details carry the safety. `planRedrive` is a **dry run**: it shows what would move and what is refused, and nothing changes until a person confirms. The redrive is a **process**, not a call: a scheduler moves `perMinute` messages each minute, so it can be watched and stopped. And a redriven message starts with **attempts reset**: it gets a fresh set of tries under the new code, and if it fails three more times it comes back with new failure times that show the fix did not cover it."),
        h3("Purge: delete old entries, never the evidence of today"),
        p("A DLQ cannot grow forever. Brokers also expire messages on their own: SQS keeps a message for the queue's retention period, and for standard queues the clock starts at the **original** enqueue time, not at the move to the DLQ, so a message that spent three days retrying has three days less in the DLQ (check the SQS docs for your queue type). Do not rely on that silently; purge on purpose, by age of the last failure, after the entries are exported or summarised in the incident log:"),
        code("typescript", `
async purge(queue: string, olderThanDays: number): Promise<number> {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    throw new BadRequestException("olderThanDays must be a whole number of at least 1"); // 0 would mean "everything"
  }
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  return this.queues.deleteDead(queue, (d) => d.lastFailedAt <= cutoff);
}`, "dlq.service.ts"),
        p("The validation is not decoration. A purge with `olderThanDays: 0` deletes every entry, including the ones that arrived five minutes ago and that nobody has looked at. That is exactly the kind of command someone types at 3 a.m."),

        h2("5. The challenge: a DLQ you can redrive and purge"),
        p("The challenge gives you a main queue and a DLQ in memory, a clock in minutes and a handler whose failures you can switch off with a `deploy` command. You write the three functions that make the DLQ usable:"),
        bullets([
            "**`tick`**: one minute. Move up to `redrivePerTick` messages back (skipping any whose id is already in the main queue), then deliver one message; dead-letter it with its metadata when it reaches `maxAttempts`.",
            "**`redrive`**: select by ids or by last error, refuse what is not in the DLQ or has an unsupported schema, and queue the rest. Nothing moves here; `tick` does the moving, at the limited rate.",
            "**`purge`**: validate the age, then delete by last failure time.",
        ]),
        p("The description lists the exact event texts. Each test is an incident in miniature: a fix and a redrive, a learner's resend racing the redrive, a v1 payload, a purge at the exact boundary."),
        challenge("chal_coding_bjm_322"),

        h2("6. How to verify a redrive"),
        bullets([
            "**Before: the dry run.** Count what will move per error group and what is refused, and compare with the DLQ listing. 1,184 to move, 5 refused, matches evidence A.",
            "**During: the main queue.** Oldest message age should stay near its normal value (seconds), and the rendered rate should stay under capacity. If age climbs, lower the rate or stop.",
            "**After: the DLQ and the side effects.** The RenderError group is empty; no redriven message came back with the same error. A query like evidence C returns zero rows for the redrive window: no learner got the same certificate twice.",
            "**In tests:** a fake clock and an in-memory queue, as in the challenge. Assert the per-minute rate, the refusal of an unsupported schema, the skip of an id already in the main queue and the reset of attempts.",
        ]),

        h2("7. Common mistakes with dead-letter queues"),
        bullets([
            "**Redriving everything.** Groups whose cause is not fixed fail again and may page someone again. Spot it: a redrive command with no filter, and DLQ entries that come back with the same last error minutes later.",
            "**Redriving at full speed.** The backlog lands on top of live traffic. Spot it: oldest message age in the main queue jumps right after a redrive.",
            "**Replaying old schemas into new code.** The result can be wrong instead of failing. Spot it: DLQ entries older than the last schema change, and outputs with empty or default fields after a redrive.",
            "**Ignoring duplicates.** Users often retry by hand while the DLQ fills. Spot it: two jobs with the same business id in the main queue, or two side effects (emails, certificates) for one event.",
            "**Unvalidated purge.** \"Delete older than 0 days\" deletes everything. Spot it: a purge API that accepts 0, negative or fractional values, or a purge with no export or log of what was deleted.",
        ]),

        h2("8. Summary"),
        numbered([
            "A DLQ entry is evidence: keep the original message with its schema version, the attempt count, first and last failure times and the last error, and group by last error to decide.",
            "Redrive only after a fix, only the group it fixes, only schemas the code supports, at a rate the queue can absorb, and never on top of a message that is already back in the main queue; reset attempts so the new code gets a fair try.",
            "Purge by age of the last failure, with a validated argument and a record of what was deleted, so the DLQ stays small without losing what nobody has looked at yet.",
        ]),

        h2("Sources"),
        bullets([
            "Amazon SQS Developer Guide: using dead-letter queues, redrive policy and moving messages out of a dead-letter queue - docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/",
            "BullMQ documentation: retrying failing jobs, failed jobs and job.retry() - docs.bullmq.io",
            "RabbitMQ documentation: dead letter exchanges - rabbitmq.com/docs/dlx",
        ]),
        callout("tip", "Self-practice (not graded): the redrive checklist",
            "Turn section 3 into a checklist the queue console shows before any redrive can start: the cause and the deploy that fixed it, the selection (error group or ids), the schema check result, the rate and the expected drain time, the duplicate check, who approved it, and the query that will prove no side effect happened twice. Then apply it to evidence A and write the three lines you would post in the incident channel before pressing the button."),
    ],
});
