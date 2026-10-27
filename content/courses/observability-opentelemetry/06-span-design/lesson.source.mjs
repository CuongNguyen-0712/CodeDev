// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-2-3",
    title: "Span design: names, attributes & what not to record",
    slug: { _type: "slug", current: "span-design-names-attributes-what-not-to-record" },
    description:
        "A month after tracing went live, the CodeDev trace backend has two million distinct span names, a security review finds access tokens and password hashes in span attributes, and the one grading timeout on-call needed was never sampled. Learn to design spans on purpose: low-cardinality names from route templates, attributes from the semantic conventions (and which version you emit), what never to record, when an event beats a child span, links for queues and batches, and what head and tail sampling do to rare errors.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev platform team",
        problem:
            "The first monthly review of tracing on CodeDev produced three findings. The operation drop-down of the trace UI for submissions-api is unusable: it lists over two million span names, most of them containing course ids, user ids or whole SQL statements. A security review found spans carrying Authorization headers, e-mail addresses and password hashes, readable by everyone with access to the trace UI. And when a learner reported a grading timeout, on-call could not find a single trace of it, although the job id and the time were known. You are asked to write the span design rules for the team and fix the worst offenders.",
    },

    content: [
        h2("1. The incident: traces nobody can use"),
        p("Instrumenting is easy: auto-instrumentation creates spans for every HTTP request, query and queue operation, and a few `startActiveSpan` calls add the rest. Designing what those spans are **called**, what they **carry** and which of them are **kept** is what decides whether traces answer questions a month later. CodeDev skipped that step. Here is what the review found."),

        h2("2. The evidence"),
        h3("A. Span names, submissions-api, last 7 days"),
        code("text", `
Distinct span names: 2,184,331
  GET /courses/8812/lessons/3                                    count 41
  GET /courses/8812/lessons/4                                    count 38
  GET /courses/9921/lessons/1                                    count 12
  SELECT * FROM progress WHERE user_id = 'u_8812' AND lesson_id = 'l_3'   count 1
  grade submission sub_7c1 for an.nguyen@example.com             count 1
  ...
Backend notice: span name limit reached, further names grouped as "other"`, "Trace backend, operations of submissions-api (the wording of the notice depends on your backend)"),
        h3("B. One span found by the security review"),
        code("text", `
Span  PATCH /users/u_8812/email      service submissions-api
  http.method                         PATCH
  http.target                         /users/u_8812/email?token=7f3a91c2e0b4
  http.request.header.authorization   Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
  user.email                          an.nguyen@example.com
  db.statement                        UPDATE users SET email = 'an.nguyen@example.com', password_hash = '$2b$12$Qe1...' WHERE id = 'u_8812'`, "Trace UI, span attributes"),
        h3("C. The trace that was not there"),
        code("text", `
Support: learner u_4410, submission sub_88a, "grading timed out" at 09:41.
Log store:  grading-worker  09:41:07  "grading timed out"  job_id=5120  trace_id=2c9e41f0...
Trace UI:   trace 2c9e41f0...  -> "Trace not found"

Sampler (otel.ts, both services):  ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) })
Grading jobs yesterday: 2,140, timed out: 7 (0.33%)`, "On-call notes"),

        h2("3. Span names: low cardinality, by design"),
        p("A span name says **what kind of operation** this is. It is what the trace UI groups by, what latency breakdowns are computed per, and what you type into a search. It must therefore have a small, stable set of values. Anything that identifies **this particular** request (an id, a user, a value) belongs in an attribute, where it can be searched without creating a new operation for every request."),
        bullets([
            "**HTTP server spans:** method plus route template: `GET /courses/:courseId/lessons/:lessonId`, not the raw path. The HTTP instrumentation can only do this when the framework instrumentation (for NestJS or Express) tells it the route; without it you get just `GET`, which is low-cardinality but vague. Never fall back to the raw URL.",
            "**HTTP client spans:** the method, or method plus a URL template you define. Not the full URL with query string.",
            "**Database spans:** operation and table, for example `SELECT progress` or `INSERT submissions`, never the statement text.",
            "**Messaging spans:** operation and destination, for example `send grading` and `process grading`.",
            "**Your own spans:** a verb and an object from a fixed vocabulary: `plagiarism.check`, `grade submission`, `leaderboard.update`. If you are tempted to put a variable into a span name, it is an attribute.",
        ]),
        p("These follow the OpenTelemetry semantic conventions for span names. The conventions are versioned and some parts are still marked experimental, so check the version your instrumentation libraries implement rather than copying names from a blog post."),

        h2("4. Attributes: use the conventions, know the version"),
        p("Attributes carry the details: the route, the status code, the table, the queue, your own ids. Use the **semantic conventions** for anything they define, because backends build features on those exact keys (error rates per route, database panels, service maps). Two traps:"),
        bullets([
            "**Names changed between versions.** The stable HTTP conventions renamed `http.method` to `http.request.method`, `http.status_code` to `http.response.status_code` and replaced `http.target` with `url.path` and `url.query`. Database conventions moved from `db.statement` to `db.query.text` and from `db.system` to `db.system.name` in later versions. Many instrumentation packages let you choose with `OTEL_SEMCONV_STABILITY_OPT_IN` (for example `http`, or `http/dup` to emit both during a migration). Check which keys your dashboards and alerts query before switching.",
            "**Your own attributes need a namespace and a type.** `submission.id` and `course.id` are readable in this course; in a real system a prefix such as `codedev.` avoids clashing with future conventions. Keep the type stable (an id is always a string) or queries break silently.",
        ]),
        p("Ids are fine as **span attributes**: a trace backend is built to store high-cardinality attributes and search by them, which is exactly how lesson 2.2 found the orphan trace. The same ids as **metric labels** are a different story (module 3)."),

        h2("5. What never goes into a span"),
        p("Traces are copied to a backend that more people can read than your database, kept for weeks, and exported to vendors. Treat every attribute as if it will be read by everyone with access to the trace UI."),
        bullets([
            "**Secrets:** `Authorization` and `Cookie` headers, API keys, session tokens, password reset tokens in query strings (B's `?token=`), signed URLs. Capturing request headers is opt-in in the HTTP instrumentation; allow-list the few you need.",
            "**Personal data:** e-mail addresses, names, phone numbers, IP addresses where your privacy policy says so. Use a pseudonymous id (`u_8812`) and look the person up in the system that is allowed to hold their data.",
            "**Full SQL with values:** a statement with literals can contain anything the row contains, including password hashes. Database instrumentations normally record the parameterised text (`... WHERE id = $1`) and leave values out unless you enable an option for it; keep it that way, and sanitise statements you record yourself.",
            "**Bodies:** request and response bodies, and on CodeDev the learners' **source code**, which is their work and can contain their own secrets.",
        ]),
        p("Fix it at the source first: do not set the attribute. Then add defence in depth in the Collector, whose `attributes`, `transform` and `redaction` processors can delete or hash keys and mask values that match a pattern (check which processors your Collector distribution includes). And treat a leak like B as an incident: the data is already stored, so purge or expire it in the backend and rotate the exposed tokens."),

        h2("6. Events or child spans?"),
        p("Both live inside a span. A **child span** is an operation with a start, an end, its own status and its own attributes, and it shows up in the waterfall. A **span event** is a timestamped point inside a span, with attributes, and no duration."),
        bullets([
            "**Use a child span** when the work takes time that can matter on its own and can fail on its own: a query, an HTTP call, the plagiarism check, each attempt of a retried call (the HTTP conventions record each resend as its own client span).",
            "**Use an event** for a moment: a cache miss, a retry decision, \"lock acquired\", a validation warning. Exceptions are recorded as an event named `exception` (`span.recordException(err)`), together with an error status on the span.",
            "**Use neither inside hot loops.** Grading 400 test cases as 400 child spans makes the trace unreadable and expensive. Record one `run tests` span with the count and the duration as attributes, and add an event for each failing case, or child spans only for cases slower than a threshold.",
        ]),

        h2("7. Links: when one parent is not enough"),
        p("A span has at most one parent. Two common shapes do not fit that rule:"),
        bullets([
            "**Fan-in (batches).** The leaderboard worker takes up to 100 \"score changed\" jobs from 100 different requests and updates the leaderboard once. Its `process leaderboard-updates` span cannot be a child of 100 traces. Give it **links** to the 100 producer contexts and record `messaging.batch.message_count`; from any of the requests you can follow the link to the batch that processed it.",
            "**Long or independent follow-up work.** A job that runs hours later, or a nightly recalculation started by many earlier events, makes a trace that is very long and mostly empty if it is a child. Start a new trace and link it to the context that caused it.",
        ]),
        code("typescript", `
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, propagation, trace, type SpanContext } from "@opentelemetry/api";

const tracer = trace.getTracer("leaderboard-worker");

async function processBatch(jobs: Job<ScoreChanged>[]): Promise<void> {
  const links = jobs
    .map((job) => trace.getSpanContext(propagation.extract(ROOT_CONTEXT, job.data.otel ?? {})))
    .filter((ctx): ctx is SpanContext => ctx !== undefined)
    .map((ctx) => ({ context: ctx }));

  await tracer.startActiveSpan("process leaderboard-updates", {
    kind: SpanKind.CONSUMER,
    links,                                               // the SDK caps links per span (OTEL_SPAN_LINK_COUNT_LIMIT)
    attributes: { "messaging.destination.name": "leaderboard-updates", "messaging.batch.message_count": jobs.length },
  }, async (span) => {
    try {
      await leaderboard.applyBatch(jobs.map((j) => j.data));
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}`, "leaderboard.worker.ts (OpenTelemetry API 1.x)"),

        h2("8. Sampling: which traces you keep"),
        p("Keeping every span of every request is often too expensive, so traces are sampled. Where the decision is made changes what you can find later."),
        bullets([
            "**Head sampling** decides when the root span starts, before anything has happened. `ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) })` (or `OTEL_TRACES_SAMPLER=parentbased_traceidratio` with `OTEL_TRACES_SAMPLER_ARG=0.1`) keeps about 10% of traces, and the parent-based part makes every downstream service follow the decision carried in the `traceparent` flags, so kept traces are complete. It is cheap and simple. It is also blind: an error or a timeout that happens later in the request is kept with the same 10% probability as a fast success.",
            "**Tail sampling** decides after the spans of a trace have arrived, in the Collector (the contrib `tail_sampling` processor). Policies such as \"keep every trace with an error status\", \"keep traces slower than 2 s\" and \"keep 5% of the rest\" keep exactly the rare traces you need. The cost: every span of a trace must reach the same Collector instance (route by trace id, for example with the load-balancing exporter), the Collector holds traces in memory while it waits, and spans that arrive after the decision window, such as a worker that picks the job up minutes later, are decided without the rest of the trace.",
        ]),
        p("Look at C again with that in mind: 7 timeouts out of 2,140 jobs, kept at 10%, means 0.7 timeout traces a day on average, and on about half of such days none at all. Two rules follow. **Count with metrics, explain with traces**: metrics are not sampled, so the timeout rate and its alert must come from a counter, not from searching traces. And **sample on outcome when rare failures matter**: tail sampling with an error policy, or at least a higher head-sampling rate for the worker's own traces if they are separate (linked) traces."),

        challenge("chal_quiz_otl_231"),

        h2("9. Worked example: the span design of the submit flow"),
        p("Write the design down where the team can review it, next to the code. For CodeDev's submit flow it fits on one screen:"),
        code("text", `
Span name                     Kind      Key attributes                                          Notes
POST /submissions             SERVER    http.request.method, http.route, http.response.status_code,
                                        submission.id, course.id                                 from instrumentation + 2 custom
auth.verify                   INTERNAL  (none)                                                   no token, no user e-mail
SELECT problems               CLIENT    db.system.name, db.operation.name, db.collection.name    query text parameterised only
plagiarism.check              CLIENT    submission.id, plagiarism.verdict                        no source code
INSERT submissions            CLIENT    db.* as above
send grading                  PRODUCER  messaging.destination.name=grading, messaging.message.id  carrier injected into job
process grading               CONSUMER  messaging.*, submission.id                               child of send grading
  run tests                   INTERNAL  tests.total, tests.failed                                event per failing case
process leaderboard-updates   CONSUMER  messaging.batch.message_count                            links, no parent
Events: cache miss, exception (recordException + ERROR status)
Never: Authorization, Cookie, e-mail, names, request bodies, learner code, SQL values`, "docs/observability/span-design.md"),

        h2("10. How to verify"),
        p("Span design rots unless a test checks it. Run the flow against the in-memory exporter and assert on the result:"),
        code("typescript", `
const ALLOWED_NAMES = new Set(["POST /submissions", "auth.verify", "SELECT problems", "plagiarism.check",
  "INSERT submissions", "send grading", "process grading", "run tests"]);
const FORBIDDEN_KEY = /authorization|cookie|password|token|e-?mail|body|source/i;
const LOOKS_PERSONAL = /@|Bearer |\\$2[aby]\\$/;

test("submit flow spans follow the span design", async () => {
  await submitAndGrade(fixtures.submission);
  for (const span of exporter.getFinishedSpans()) {
    expect(ALLOWED_NAMES).toContain(span.name);
    for (const [key, value] of Object.entries(span.attributes)) {
      expect(key).not.toMatch(FORBIDDEN_KEY);
      expect(String(value)).not.toMatch(LOOKS_PERSONAL);
    }
  }
});`, "span-design.test.ts"),
        bullets([
            "**In production, watch the number of distinct span names per service.** It should be roughly the number of routes plus your custom operations, and stay flat when traffic grows.",
            "**Search the backend for leaks on a schedule:** attribute values containing `@`, `Bearer `, `$2b$` or `password`. Zero results is the only acceptable result.",
            "**Check sampling against a known rare event.** Count the errors in the metric for a day, count the error traces you can find for the same day; the ratio is your effective sampling rate for errors.",
        ]),

        h2("11. Common mistakes"),
        bullets([
            "**Raw URLs or ids in span names.** Spot it: the operation list grows with traffic, or the backend starts grouping names as \"other\".",
            "**Mixing convention versions.** Half the services emit `http.status_code`, the other half `http.response.status_code`, and the error-rate panel silently covers half the traffic. Spot it: a dashboard query that returns fewer requests than the load balancer counts.",
            "**Recording \"everything, just in case\".** Headers, bodies, full SQL. Spot it: any attribute value that contains `@`, a token prefix or a hash; run the test above.",
            "**A child span per loop iteration.** Spot it: traces with thousands of identical spans and a trace UI that takes seconds to open.",
            "**Searching traces for the error rate.** With sampling, a trace search under-counts by the sampling rate. Spot it: an alert or report that counts traces instead of reading a metric.",
        ]),

        h2("12. Summary"),
        numbered([
            "Span names describe the kind of operation and come from a small fixed set (route templates, operation plus table or queue); everything that identifies one request goes into attributes.",
            "Attributes follow the semantic conventions of a known version, and never carry secrets, personal data, SQL values, bodies or learner code. Remove at the source, redact in the Collector as a second line.",
            "Use events for moments and child spans for operations, links for batches and long follow-ups, and remember that head sampling keeps rare errors at the same low rate as everything else: count with metrics, keep error traces with tail sampling.",
        ]),

        h2("Sources"),
        bullets([
            "OpenTelemetry concepts: Signals (traces, spans, events, links) - https://opentelemetry.io/docs/concepts/signals/",
            "OpenTelemetry semantic conventions: HTTP, database and messaging spans - opentelemetry.io/docs/specs/semconv/",
            "OpenTelemetry concepts: Sampling - opentelemetry.io/docs/concepts/sampling/",
            "W3C Trace Context (the sampled flag) - https://www.w3.org/TR/trace-context/",
        ]),
        callout("tip", "Self-practice (not graded): review your own spans",
            "Pick one service you own. Export the list of distinct span names for a week and the attribute keys of its ten most frequent spans. Mark every name that contains a variable and every key or value that falls under section 5, write the span design table for its main flow like section 9, and estimate how many traces of your rarest error you keep per day with your current sampler."),
    ],
});
