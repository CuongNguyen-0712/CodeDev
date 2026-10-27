// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-3-2",
    title: "Progress that never goes backwards: idempotent updates",
    slug: { _type: "slug", current: "idempotent-progress-updates" },
    description:
        "A slow event from the mobile app's offline queue moved a lesson from 80% back to 40%, and a retried request issued a second completion certificate. Learn why progress events arrive twice and out of order, how a never-decreasing rule makes the order irrelevant, why the eventId is needed for side effects, how to publish \"course completed\" exactly once, and what the database must guarantee when two API instances receive the same event.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (ProgressModule)",
        problem:
            "Ticket #5288 from learner u_2290: \"I finished the video of 'Debug a broken page' yesterday on the train and the app showed 80%. This morning it says 40% and my course went from 98% to 94%. Then I finished it again and got two certificate emails for Web Application Fundamentals.\" The mobile app sends POST /progress/events while a learner watches or reads a lesson. Offline, it queues the events and sends them when the connection comes back; online, it retries a request that takes longer than 2 seconds. ProgressService stores whatever percent arrives last and issues a certificate whenever the course is at 100%.",
    },

    content: [
        h2("1. The incident: the last request wins, even when it is the oldest"),
        p("This is the progress endpoint as it shipped. It was written for the web app, which sends one event at a time and only while online, and on the web it worked:"),
        code("typescript", `
// src/progress/progress.service.ts - the version that shipped
@Injectable()
export class ProgressService {
    constructor(
        private readonly progress: ProgressRepository,
        private readonly certificates: CertificateService,
    ) {}

    async record(userId: string, dto: ProgressEventDto) {
        // INSERT ... ON CONFLICT (user_id, course_id, lesson_id) DO UPDATE SET percent = EXCLUDED.percent
        await this.progress.upsert(userId, dto.courseId, dto.lessonId, dto.percent);
        const coursePercent = await this.progress.coursePercent(userId, dto.courseId);
        if (coursePercent === 100) await this.certificates.issue(userId, dto.courseId);
        return { coursePercent };
    }
}`, "progress.service.ts"),
        p("Two assumptions are hidden in eight lines: that events arrive in the order they happened, and that each arrives once. The mobile app breaks both. Its offline queue sends old events late, several requests can be in flight at once, and its retry after a timeout sends an event the server may already have processed."),

        h2("2. Reproduce it and read the evidence"),
        p("The API logs every event with the id the app generated when the event happened. Filter them for the learner and the lesson:"),
        code("text", `
received      instance  eventId  lesson  percent  took    note
14:02:01.204  api-2     ev_7e9   whf-10  40       3.71 s  created 13:58 on the train, sent from the offline queue
14:02:02.033  api-1     ev_7f1   whf-10  80       0.29 s  created 14:01
14:02:04.917  api-2     ev_7e9   ...                      -> its UPDATE commits now: percent = 40
09:15:40.481  api-1     ev_802   whf-10  100      2.40 s  client timeout after 2 s
09:15:42.903  api-2     ev_802   whf-10  100      0.31 s  retry of the same event`, "API log, u_2290"),
        p("Read the first three lines together. `ev_7e9` was the older event (40%), but its request was slow and committed **after** `ev_7f1` (80%). The upsert did exactly what it says: the last write won, and the last write was the oldest value. Then, the next morning, `ev_802` arrived twice with the same id: the first request was slow, the app gave up after 2 seconds and sent it again. Both requests found the course at 100% and both issued a certificate:"),
        code("sql", `
SELECT id, user_id, course_id, issued_at FROM certificates
WHERE user_id = 'u_2290' AND course_id = 'web-http-fundamentals';

    id     | user_id | course_id             | issued_at
-----------+---------+-----------------------+----------------------------
 CRT-88213 | u_2290  | web-http-fundamentals | 2026-10-21 09:15:42.871+00
 CRT-88214 | u_2290  | web-http-fundamentals | 2026-10-21 09:15:43.180+00`, "psql"),
        p("You can reproduce both halves without a phone: send two requests for the same lesson in parallel, the lower percent second but with an artificial delay in the handler, then send the same event body twice. The first shows the regression, the second the duplicate certificate."),

        h2("3. Core idea: make the order and the repeats irrelevant"),
        p("You cannot fix this on the client. Networks drop responses, apps retry, queues redeliver. Any system that sends events over a network delivers them **at least once**, in **no guaranteed order**. The handler has to produce the right result anyway. Three rules get you there:"),
        numbered([
            "**Progress never decreases: store the maximum.** If the stored value is `max(stored, incoming)`, then 40 after 80 changes nothing, 80 twice changes nothing, and any order of the same events ends in the same state. A rule that does not care about order or repeats cannot be broken by them. This is a domain rule, not a technical trick: a learner who watched 80% of a video has watched 80%, whatever arrives later.",
            "**Remember every eventId you processed.** The max rule makes the stored state idempotent, but not everything else: counting \"lessons finished today\", awarding EXP, writing an audit row. A processed-events record lets you answer `duplicate` and skip the whole event. It also lets the client know its retry was recognised.",
            "**Fire side effects on a transition, not on a state.** \"The course is at 100%\" is true for every event after completion, retries and late events included. \"This event moved the course from below 100% to 100%\" is true for exactly one event. Certificates, emails and the `course.completed` event hang off the transition.",
        ]),
        callout("info", "When not to use a never-decreasing rule",
            "The max rule fits values that only grow: progress, a high score, the furthest position in a video. It is wrong for values that legitimately go down or that the user edits: a learner who resets a course, a note that is rewritten, a setting toggled off and on. Do not let a lower percent sneak in as a \"reset\": make the reset its own explicit command. For edited values, order matters, and you need a version number or a timestamp the server compares (reject or ignore anything older than what is stored) instead of a max."),
        h3("What the eventId does not replace"),
        p("Deduplicating by eventId alone does not fix the regression: `ev_7e9` and `ev_7f1` are different events, both legitimate, so both pass the duplicate check. And the max rule alone does not stop the second certificate if the certificate fires on a state. You need both rules, and the transition."),
        p("Keep the processed-events record bounded: the app retries for at most a few days, so keeping ids for, say, 30 days covers every retry. Ids are cheap, but a table nobody prunes keeps growing."),

        challenge("chal_quiz_nmm_321"),

        h2("4. Worked example: one transaction per event"),
        p("In PostgreSQL each rule becomes one statement, and the transaction makes them hold even when two API instances receive the same event at the same time:"),
        code("sql", `
CREATE TABLE processed_events (
    event_id    text PRIMARY KEY,
    received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE certificates
    ADD CONSTRAINT certificates_user_course_key UNIQUE (user_id, course_id);

-- 1. remember the event; no row back = already processed (or being processed by another instance)
INSERT INTO processed_events (event_id) VALUES ($1)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;

-- 2. never decreases: GREATEST keeps the higher value
INSERT INTO lesson_progress (user_id, course_id, lesson_id, percent) VALUES ($2, $3, $4, $5)
ON CONFLICT (user_id, course_id, lesson_id)
DO UPDATE SET percent = GREATEST(lesson_progress.percent, EXCLUDED.percent), updated_at = now();

-- 3. one certificate per learner and course, enforced by the constraint
INSERT INTO certificates (id, user_id, course_id) VALUES ($6, $2, $3)
ON CONFLICT (user_id, course_id) DO NOTHING
RETURNING id;`, "progress.sql"),
        p("The service decides; the repository runs the statements. Note what the service does with the answers: a duplicate stops everything, and the completion event is published only when the certificate insert actually returned a row, that is, by exactly one request:"),
        code("typescript", `
// src/progress/progress.service.ts
async record(userId: string, event: ProgressEventDto): Promise<RecordResult> {
    const lessonIds = await this.courses.lessonIds(event.courseId);          // CourseModule's exported service
    if (!lessonIds?.includes(event.lessonId)) throw new LessonNotInCourseError(event.courseId, event.lessonId);

    const result = await this.tx.run(async (repo) => {
        if (!(await repo.markProcessed(event.eventId))) return { status: "duplicate" as const };

        await repo.raiseLessonPercent(userId, event.courseId, event.lessonId, event.percent);
        const coursePercent = await repo.coursePercent(userId, event.courseId, lessonIds);
        const certificateId = coursePercent === 100 ? await repo.issueCertificateOnce(userId, event.courseId) : null;
        return { status: "recorded" as const, coursePercent, completed: certificateId !== null };
    });

    if (result.status === "recorded" && result.completed) {
        this.events.emit("course.completed", { userId, courseId: event.courseId });   // after COMMIT
    }
    return result;
}`, "progress.service.ts"),
        bullets([
            "**The duplicate check is an INSERT, not a SELECT.** `SELECT ... WHERE event_id = $1` followed by an insert is the race from the previous lesson: two instances both see no row. With the primary key, the second `INSERT ... ON CONFLICT DO NOTHING` waits for the first transaction and then returns nothing.",
            "**The event is emitted after the commit.** Emitting inside the transaction would announce a completion that a rollback could undo. If a lost event after a crash is not acceptable, write it to an outbox table in the same transaction and publish it from there; that is a topic of its own.",
            "**The database rule is a backstop, not the design.** The certificate constraint guarantees one row even if the service has a bug; the service should still only try once. In the exercise below there is no database, so the service itself must detect the transition from below 100% to 100%.",
        ]),

        h2("5. How to verify it"),
        bullets([
            "**Replay tests: any order, any repeats, same result.** Take a list of events, run it in order, then reversed, then shuffled with some events doubled. The final percentages must be identical, and exactly one `course.completed` must be published. This is the most direct test of \"order does not matter\".",
            "**A test per rule.** 40 after 80 stays 80; the same eventId twice is `duplicate`; a late event on a completed course publishes nothing; an invalid event leaves no trace.",
            "**Look for regressions in the data.** If `lesson_progress` keeps a history (or an audit trigger does), a query for rows whose percent is lower than the previous value for the same lesson must return nothing after the fix.",
            "**The certificate query from section 2,** grouped by `(user_id, course_id) HAVING count(*) > 1`, returns 0 rows, and adding the unique constraint succeeds.",
            "**Two deliveries at once.** Send the same event body to two local API instances in parallel (`curl ... & curl ... & wait`): one answer says recorded, the other duplicate, and `processed_events` holds one row.",
        ]),
        code("typescript", `
it("ends in the same state whatever the order and the repeats", () => {
    const events = [ev("e1", 40), ev("e2", 80), ev("e3", 100)];
    for (const order of [events, [...events].reverse(), [events[2], events[0], events[2], events[1], events[0]]]) {
        const { service, progress, bus } = setup();            // fresh in-memory fakes
        order.forEach((e) => service.record(e));
        expect(progress.get("u_2290", COURSE, "whf-10")).toBe(100);
        expect(bus.published).toHaveLength(1);
    }
});`, "progress.service.spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**Last write wins on a value that only grows.** `SET percent = EXCLUDED.percent` lets a late event move progress back. Spot it with a test that sends 80 then 40, or in the data as a lesson whose percent went down.",
            "**Side effects on a state.** `if (coursePercent === 100) issue()` fires on every event after completion. Spot it with a test that sends one more event, or a retry, after the course is complete and counts the certificates.",
            "**A check-then-insert for the eventId.** A SELECT before the insert, or an in-memory `Set` in one API instance, lets two instances process the same event. Spot it by sending the same event to two instances at once.",
            "**Forgetting stale events in the processed list.** If only applied events are remembered, a retried stale event is treated as new. Harmless for the percent, wrong for anything counted per event. Spot it with a test that retries an event that changed nothing.",
            "**Rounding the course percent up.** `Math.round` turns 99.7% into 100% and completes a course with a lesson still unfinished. Spot it with three lessons at 100, 100 and 99.",
        ]),

        h2("7. Write the progress rules"),
        p("The challenge gives you the event type, the stores as in-memory fakes (a lesson progress repository, a processed-events store and an event bus) and a test runner that replays events with duplicates, late events and invalid values. Write `record` so the progress never goes backwards, a known eventId changes nothing and `course.completed` is published exactly once:"),
        code("typescript", `
record(event: ProgressEvent): RecordResult {
    // 1. invalid? (ids, lesson in the course, integer percent 0..100) -> nothing changes
    // 2. eventId already processed? -> duplicate
    // 3. not higher than what is stored? -> stale (remember the eventId anyway)
    // 4. store it; publish course.completed only if this event finished the course
}`),
        challenge("chal_coding_nmm_322"),

        h2("8. Summary"),
        bullets([
            "Events from clients arrive at least once and in any order; make the rule indifferent to both. For progress that means \"never decreases\": store the maximum, so a late or repeated event changes nothing.",
            "Remember processed eventIds for everything the max rule does not cover, and fire side effects such as certificates and `course.completed` on the transition to 100%, never on the state of being at 100%.",
            "Let the database enforce what concurrency can break: a primary key on the event id inserted in the same transaction, `GREATEST` in the upsert and a unique constraint on certificates; publish after the commit.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: INSERT, the ON CONFLICT clause (sql-insert.html) and GREATEST/LEAST (Conditional Expressions)",
            "NestJS documentation: Events (docs.nestjs.com/techniques/events)",
            "RFC 9110, HTTP Semantics: section 9.2.2 (Idempotent Methods)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a \"reset course progress\" command to ProgressService: an explicit action, not a lower percent, that sets every lesson of the course back to 0 for one learner. Decide what happens to an event created before the reset that arrives after it (hint: compare the event's creation time with the reset time), what happens to the certificate, and write the replay test that proves it."),
    ],
});
