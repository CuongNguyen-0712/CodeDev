// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-4-1",
    title: "A vertical slice: API to leaderboard, idempotent end to end",
    slug: { _type: "slug", current: "vertical-slice-api-to-leaderboard-idempotent" },
    description:
        "The first end-to-end slice of CodeDev passed every demo, then the nightly reconciliation found 37 learners whose leaderboard score did not match their progress: some counted twice, some missing. Learn why a vertical slice is the cheapest way to test an architecture, find the hop that duplicates or loses each kind of drift, and make every hop idempotent: an idempotency key saved with the response, a transactional outbox for events, and a consumer that deduplicates in the same atomic step as its write. Then prove it converges with scripted crashes.",
    estimatedTime: 40,

    scenario: {
        role: "Backend engineer building the first vertical slice, CodeDev learning platform",
        problem:
            "The slice POST /lessons/:lessonId/complete -> progress service -> event bus -> leaderboard consumer went live on Monday. On Thursday the nightly reconciliation job, which compares each learner's points in PostgreSQL with their score in the Redis weekly leaderboard, reported 37 mismatches out of 20,112 active learners: 21 learners have more points on the board than in their progress, 16 have fewer. Support also has 9 tickets from mobile learners who saw \"Something went wrong\" on a completed lesson, tapped again and got \"Already completed, +0 points\". Nothing in the logs is an error the code did not handle.",
    },

    content: [
        h2("1. The incident: a slice that only works on the happy path"),
        p("The slice was built the way most first versions are: each layer does its job and calls the next one. Every unit test passed and the demo looked perfect, because in a demo nothing crashes between two lines:"),
        code("typescript", `
// progress.controller.ts + progress.service.ts (release 2026.10.19)
@Post("lessons/:lessonId/complete")
async complete(@User() user: AuthUser, @Param("lessonId") lessonId: string) {
  const progress = await this.db.transaction((tx) => tx.progress.addLesson(user.id, lessonId));
  await this.bus.publish({ type: "LessonCompleted", userId: user.id, lessonId, points: progress.added });
  return { lessonId, newlyCompleted: progress.added > 0, totalPoints: progress.points };
}

// leaderboard.consumer.ts
async onLessonCompleted(e: LessonCompleted) {
  await this.redis.zincrby(\`lb:weekly:\${isoWeek()}\`, e.points, e.userId);
}`, "release 2026.10.19"),
        p("The reconciliation report is the first piece of evidence. It is a plain query over PostgreSQL plus one `ZSCORE` per learner, and it is the most useful test this slice has, because it checks the invariant of the whole path: **the board is a projection of progress, so the two must agree**."),
        code("text", `
reconciliation 2026-10-22 03:00  week 2026-W43
learners checked            20,112
board > progress               21   (e.g. u_3307: progress 120, board 140, diff +20 = one lesson)
board < progress               16   (e.g. u_4410: progress 90, board 70, diff -20 = one lesson)
every diff is exactly the points of one lesson`, "nightly reconciliation"),

        h2("2. Read the evidence: one kind of drift per hop"),
        p("A difference of exactly one lesson's points means one event was counted twice or not at all. Match each symptom to the logs of the hop where it can happen:"),
        code("text", `
# u_3307 (+20): the consumer pod was killed during a deploy
10-21 18:02:11.402 consumer lb-5d8: LessonCompleted u_3307 l_118 -> ZINCRBY +20
10-21 18:02:11.405 consumer lb-5d8: SIGTERM, shutting down (message not acked)
10-21 18:02:41.019 consumer lb-77a: LessonCompleted u_3307 l_118 -> ZINCRBY +20   (redelivery)

# u_4410 (-20): the API pod was stopped between commit and publish
10-21 09:14:03.118 api-7c9f: tx COMMIT user=u_4410 lesson=l_212
10-21 09:14:03.121 api-7c9f: SIGTERM received, shutting down

# mobile ticket #5521: the response was lost, the retry is a new request
10-21 12:40:07.880 api-2b1e: POST /lessons/l_305/complete u_1975 200 newlyCompleted=true  (client: timeout after 10 s)
10-21 12:40:19.311 api-2b1e: POST /lessons/l_305/complete u_1975 200 newlyCompleted=false`, "logs, filtered by learner"),
        bullets([
            "**Board too high** is the bus doing its job: delivery is at least once, so an event whose ack was lost comes back. A consumer that adds points blindly counts it twice.",
            "**Board too low** is a dual write: PostgreSQL committed and the process stopped before `publish`. Nothing remembers that the event is still owed, so it is lost for good. The certificate service listens to the same events, so the same gap can lose a certificate.",
            "**The confusing retry** is the API hop: the progress service is already monotonic (a second completion adds nothing, lesson 4), so the data is right, but the client asked the same question twice and got two different answers.",
        ]),
        p("None of these is a bug in one component. Each one lives **between** two components, which is exactly why unit tests and a happy-path demo cannot find them, and why this course builds a vertical slice before it builds anything wide."),

        h2("3. Core idea: a thin slice, idempotent at every hop"),
        h3("Why a vertical slice, and when not"),
        p("A vertical slice is one user action implemented through every layer of the architecture you chose in lesson 3: API, service, database, event bus, consumer, projection. It is deliberately thin: one endpoint, one event type, one projection. Its job is to test the decisions that are expensive to change later: the transaction boundaries, the delivery guarantees, the ids that flow between components, the way you will observe and reconcile them. Building every layer wide first (all endpoints, then all consumers) postpones exactly those discoveries to the end."),
        p("When not to: a slice is the wrong tool before the requirements and estimates exist (lessons 1 and 2), because you would be testing an architecture for a problem you have not stated; and it is the wrong tool for a component with no interaction risk, such as a static course page. Keep it thin: the slice is not the place to polish error pages or add a second projection."),
        h3("Three hops, three duplicates, three fixes"),
        p("Write the path down and, for each hop, ask two questions: **can this step run twice?** and **can the process stop right after it?** For CodeDev the answers lead to three mechanisms, each taught in depth in an earlier course of this track:"),
        bullets([
            "**Client to API: an idempotency key.** The client generates a `requestId` once per tap and resends it on every retry. The API stores the response under `<userId>/<requestId>` **in the same transaction** as the progress, so a retry finds the stored answer and returns it unchanged. Keys are scoped per learner because each client chooses its own. (API Design for Production covers the header contract.)",
            "**Progress to bus: a transactional outbox.** The event is a row in an `outbox` table, inserted in the same transaction as the progress. A relay publishes unpublished rows and marks them published afterwards. If it dies in between, it publishes the row again: at least once, never zero times. The same outbox carries `CourseCompleted` for the certificate service and the submission events for the grader queue, so one relay protects all of them. (Data Consistency & Event-Driven Patterns.)",
            "**Bus to leaderboard: deduplicate by event id, atomically.** The consumer keeps the ids it has applied and checks, marks and increments in **one** atomic step (a Lua script in Redis). Ordering two separate commands cannot fix it: one order loses points, the other counts twice. (Background Jobs & Messaging, Redis Patterns.)",
        ]),
        callout("info", "Idempotent is not the same as exactly once",
            "No hop here is delivered exactly once: the client may send twice, the relay may publish twice, the bus may deliver twice. What we build is effectively-once processing: every duplicate is recognised by an id that was created once, at the source, and travels with the data. If an id is generated again on a retry (a new UUID per attempt, an event id made from a timestamp), the duplicate is no longer recognisable and the whole chain breaks."),
        p("Simplest working design first: one PostgreSQL database, an `outbox` table, a relay that polls it every 200 ms, a Lua script in Redis. At CodeDev's scale (20,000 daily active learners, roughly 120,000 lesson completions a day, a few dozen a second at peak) a polling relay is far below any limit. Change data capture from the write-ahead log is worth its operational cost only when polling becomes a measured problem."),

        challenge("chal_quiz_sdc_411"),

        h2("4. Worked example: the slice, hop by hop"),
        p("The schema keeps the three facts the slice needs in one database, so one transaction can write them together. `version` is the optimistic-concurrency column from lesson 5:"),
        code("sql", `
CREATE TABLE lesson_progress (
  user_id      text   NOT NULL,
  lesson_id    text   NOT NULL,
  points       int    NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)                -- a lesson completes once per learner
);
CREATE TABLE learner_points (user_id text PRIMARY KEY, points int NOT NULL, version int NOT NULL);

CREATE TABLE idempotency_key (
  user_id    text  NOT NULL,
  request_id text  NOT NULL,
  lesson_id  text  NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),  -- purged after 24 h
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE outbox (
  seq          bigserial PRIMARY KEY,
  event_id     text  NOT NULL UNIQUE,              -- "lesson-completed:<userId>:<lessonId>"
  type         text  NOT NULL,
  payload      jsonb NOT NULL,
  published_at timestamptz                         -- NULL = still owed
);
CREATE INDEX outbox_unpublished ON outbox (seq) WHERE published_at IS NULL;`, "schema.sql"),
        p("The handler does all of its writes inside one transaction and returns what it saved. The points come from the server's catalog, never from the request body:"),
        code("typescript", `
async complete(userId: string, requestId: string, lessonId: string): Promise<CompleteResponse> {
  return this.db.transaction(async (tx) => {
    const saved = await tx.idempotency.find(userId, requestId);       // SELECT ... FOR UPDATE
    if (saved) {
      if (saved.lessonId !== lessonId) throw new UnprocessableEntity("request_id_reused");
      return saved.response;                                          // same answer, nothing changes
    }
    const lesson = await tx.catalog.lesson(lessonId);                 // 404 if unknown, nothing saved
    const added = await tx.progress.addLesson(userId, lesson.id, lesson.points); // 0 if already done
    const total = await tx.points.total(userId);
    if (added > 0) {
      await tx.outbox.add({
        eventId: \`lesson-completed:\${userId}:\${lesson.id}\`,
        type: "LessonCompleted",
        payload: { userId, lessonId: lesson.id, points: added, completedAt: await tx.now() },
      });
    }
    const response = { lessonId, newlyCompleted: added > 0, totalPoints: total };
    await tx.idempotency.save(userId, requestId, lessonId, response);
    return response;
  });                                                                 // one COMMIT for all four writes
}`, "progress.service.ts"),
        p("Two concurrent requests with the same key would both miss the `find` and race to save. The primary key on `idempotency_key` makes the second insert fail; catch that unique violation, roll back and read the saved response again. The relay claims a batch with `SKIP LOCKED` so two relay instances never publish the same rows at the same moment, although a crash can still make it publish a row twice:"),
        code("sql", `
-- relay, every 200 ms, in its own transaction
SELECT seq, event_id, type, payload FROM outbox
WHERE published_at IS NULL ORDER BY seq LIMIT 500
FOR UPDATE SKIP LOCKED;
-- publish each row to the bus, then:
UPDATE outbox SET published_at = now() WHERE seq = ANY($1);`, "relay.sql"),
        p("The consumer runs check, mark and increment as one Lua script, so Redis applies all of it or none of it. The processed set expires with the weekly board:"),
        code("typescript", `
const APPLY_ONCE = \`
  if redis.call("SADD", KEYS[1], ARGV[1]) == 0 then return 0 end
  redis.call("ZINCRBY", KEYS[2], ARGV[2], ARGV[3])
  return 1\`;

async onLessonCompleted(e: LessonCompleted) {
  const week = isoWeek(e.completedAt);   // from the event, not from the consumer's clock
  await this.redis.eval(APPLY_ONCE, 2, \`lb:processed:\${week}\`, \`lb:weekly:\${week}\`, e.eventId, e.points, e.userId);
}`, "leaderboard.consumer.ts"),

        h2("5. Every crash point, and why it converges"),
        p("An end-to-end design is idempotent only if you can name every place the process can stop and say what the next attempt does. Do it as a table and keep it in the design doc:"),
        code("text", `
crash point                          what exists afterwards           what the retry / replay does
before the commit                    nothing                          client retries: a fresh, complete attempt
after the commit, before response    progress + outbox + saved answer client retries same requestId: saved answer
relay: before the message is sent    unpublished outbox row           next relay run publishes it
relay: after send, before mark       message on the bus, row unmarked next run publishes it again: duplicate
consumer: after Lua, before ack      board updated, message unacked   redelivered: SADD says seen, nothing changes
consumer: before Lua                 nothing in Redis                 redelivered: applied once`, "crash table"),
        p("Notice the asymmetry in the relay: **publish, then mark** can only produce duplicates, which the consumer removes; **mark, then publish** can lose an event, which nothing downstream can recover. When you cannot have both, choose the failure that the next hop can repair."),

        h2("6. The challenge: the slice in one file"),
        p("The challenge gives you the slice as in-memory components with scripted crashes: a `ProgressStore` whose transaction commits all writes together, an `EventBus` that redelivers anything not acked, and a `Leaderboard` with an `atomically` method that behaves like a Lua script. The script crashes the process before and after commits, in the middle of the relay and before consumer acks, then runs a final replay. You write the handler, the relay and the consumer so that the responses are stable under retries and the final progress, outbox and board agree."),
        challenge("chal_coding_sdc_412"),

        h2("7. How to verify"),
        bullets([
            "**The reconciliation query is the slice's acceptance test.** Run it in CI against the in-memory slice after every scripted crash scenario, and nightly in production. The invariant: for every learner, the board score for the week equals the sum of `lesson_progress.points` completed that week. Zero mismatches is the only passing result.",
            "**Kill the process at each crash point.** In staging, a fault-injection flag (for example `CRASH_AFTER=commit`) makes the API or relay call `process.exit(1)` at a named line. Retry the request and run the relay, then reconcile. One scenario per row of the crash table.",
            "**Watch the lag, not just the errors.** Export the age of the oldest unpublished outbox row and alert above 60 s: a dead relay loses nothing, but the board stops moving. Count saved-response replays and consumer duplicates skipped; a sudden rise points at a retry storm or a consumer restart loop.",
            "**Test the retry with the same id, not a new one.** A client test that retries with a fresh UUID passes against any server. Assert that the second response equals the first, field by field.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Publishing after the commit and calling it eventual consistency.** It is eventual loss. Spot it: any `await bus.publish` (or HTTP call to another service) after a transaction ends, with nothing persistent recording that it is owed.",
            "**Saving the idempotent response in a second transaction.** A crash between the two leaves the progress without the saved answer, and the retry answers differently. Spot it: two `transaction(...)` calls in one handler, or an idempotency middleware that writes after the controller returns.",
            "**A global idempotency key.** Two learners' apps both send `requestId: 1` after a reinstall and the second learner gets the first one's answer. Spot it: a unique index on `request_id` alone.",
            "**Deduplicating with two commands.** `SADD` then `ZINCRBY` (or `GET` then `SET`) loses or doubles points on a crash in between. Spot it: a dedupe check whose result decides a separate write.",
            "**Ids generated per attempt.** An event id built from `Date.now()` or a UUID created in the relay changes on every republish, so the consumer cannot recognise the duplicate. Spot it: grep where `eventId` is created; it must be in the transaction that creates the fact.",
        ]),

        h2("9. Summary"),
        numbered([
            "A vertical slice tests the decisions between components (transactions, delivery, ids) early; a reconciliation of the projection against the source of truth is its acceptance test.",
            "Each hop needs its own idempotency: a per-learner request key saved with the response, a transactional outbox published at least once, and a consumer that dedupes and writes in one atomic step.",
            "List every crash point with what remains and what the retry does; when one order can lose data and the other can only duplicate it, choose the duplicate and make the next hop remove it.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler, Patterns of Distributed Systems: Idempotent Receiver - martinfowler.com/articles/patterns-of-distributed-systems/",
            "Microservices.io: Transactional outbox pattern - microservices.io/patterns/data/transactional-outbox.html",
            "Redis documentation: Scripting with Lua (EVAL), atomic execution of scripts - redis.io/docs/latest/develop/interact/programmability/eval-intro/",
        ]),
        callout("tip", "Self-practice (not graded): extend the slice",
            "Add the next event to your slice: when a learner completes the last lesson of a course, the same transaction also inserts a CourseCompleted outbox row (event id \"course-completed:<userId>:<courseId>\") for the certificate service. Write its row in the crash table, decide what the certificate consumer uses to deduplicate, and add a reconciliation check: every learner with all lessons completed has exactly one certificate."),
    ],
});
