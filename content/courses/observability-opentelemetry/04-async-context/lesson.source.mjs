// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-2-1",
    title: "Keep context across async callbacks & queues",
    slug: { _type: "slug", current: "keep-context-across-async-callbacks-queues" },
    description:
        "Since grading moved to a queue worker, nobody can follow a submission from POST /submissions to the leaderboard: the worker's spans start new traces, its logs have no trace id, and the antivirus callback logs with someone else's trace. Learn what AsyncLocalStorage carries for you (await, promises, timers), where context is still lost (callbacks stored by a library or emitter, in-house schedulers, process boundaries), and how to carry it: bind the callback where it is registered, inject a traceparent into the job, extract it in the worker.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Two weeks ago grading moved out of the API into a BullMQ-style worker: POST /submissions now stores the submission, enqueues a grading job and answers 202. Since then, support cannot answer \"what happened to my submission?\": the trace of the request ends at the enqueue, the worker's \"process grading\" span is the root of a different trace, the worker's logs have no trace_id, and the API's antivirus callback logs with the trace id of the antivirus poller instead of the request. The OpenTelemetry SDK runs in both processes and the HTTP spans look fine.",
    },

    content: [
        h2("1. The incident: a trace that stops at the queue"),
        p("Support pasted one submission id, `sub_7c1`, into the incident channel: the learner saw \"Grading...\" for four minutes. You search the tracing backend and the log store for it. This is what comes back:"),
        code("text", `
Trace 4bf92f3577b34da6a3ce929d0e0e4736  (service submissions-api)
POST /submissions                 0 ms ───────── 74 ms
  auth.verify                     1 ms ─ 9 ms
  INSERT submissions              9 ms ── 41 ms
  send grading                   41 ms ─ 72 ms

Trace 1d6be2c08f3a4e7b9c55a0e4f1d2b688  (service grading-worker)
process grading                   (root span, no parent)  3m 51s
  run tests                       ...`, "Tracing backend, search submission.id = sub_7c1"),
        code("json", `
{"time":"14:03:12.041","service":"submissions-api","msg":"submission stored","submission_id":"sub_7c1","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736"}
{"time":"14:03:12.398","service":"submissions-api","msg":"scan result","verdict":"clean","submission_id":"sub_7c1","trace_id":"9e01c3b5a7d24f6e8b1a0c2d4e6f8a1b"}
{"time":"14:03:13.000","service":"submissions-api","msg":"rate-limit window closed","submission_id":"sub_7c1"}
{"time":"14:07:03.512","service":"grading-worker","msg":"grading finished","submission_id":"sub_7c1","job_id":"4411","score":70}
{"time":"14:07:03.530","service":"grading-worker","msg":"leaderboard updated","submission_id":"sub_7c1"}`, "Log store, submission_id = sub_7c1"),
        p("Four different failures hide in five log lines, and only one of them involves a second process. Before fixing anything, learn the one mechanism behind all of them."),

        h2("2. Read the evidence"),
        bullets([
            "**The request trace ends at `send grading`.** The producer side is fine: the job was sent inside the request's trace.",
            "**`process grading` is a root span.** The worker did not know which trace the job belonged to, so its SDK started a new one. Nothing in the job carried the context from one process to the other.",
            "**`scan result` has a trace id, but the wrong one.** `9e01...` is the trace of the antivirus poller, the loop that asks the scanner for results and emits a `scanned` event. The listener for that event ran in the poller's context.",
            "**`rate-limit window closed` has no trace id at all.** It is logged by an in-house `RateWindow` helper that collects callbacks in an array and runs them from one interval timer it started at boot.",
            "**The worker logs have no trace id either.** They run inside the worker span, but that span belongs to the wrong trace, and the log correlation only adds a trace id when a span is active (lesson 1.2).",
        ]),

        h2("3. Core idea: context is captured when work is scheduled"),
        p("In OpenTelemetry the **context** is an immutable bag that holds the active span (and baggage). `context.active()` returns the current one, `context.with(ctx, fn)` runs `fn` with `ctx` active, and every span you start without an explicit parent becomes a child of whatever `context.active()` returns at that moment. A span in the wrong trace is almost always a span started while the wrong context was active."),
        p("In Node.js the SDK keeps \"the current context\" in an `AsyncLocalStorage` (the `AsyncLocalStorageContextManager` from `@opentelemetry/context-async-hooks`, which `NodeSDK` and `NodeTracerProvider.register()` install for you; check the setup of your SDK version). Its rule is short:"),
        bullets([
            "When asynchronous work is **created** (a promise reaction, an `await`, a `setTimeout`, a socket, a file read), Node records the context active at that moment.",
            "When that work **runs**, Node restores the recorded context, whatever is running around it.",
        ]),
        p("So `await`, `.then`, `setTimeout`, `setImmediate` and the callbacks of Node's own I/O carry the context without any code from you. What they cannot know about is a callback that **a library stores itself and calls later from some other async work**:"),
        bullets([
            "**EventEmitter listeners** run synchronously inside `emit()`, in the context of whoever called `emit()`. The antivirus poller emits, so the listener gets the poller's trace.",
            "**In-house schedulers, pools and batchers** that keep callbacks in an array and drain it from a timer or a connection created at startup. The callbacks run in the context of that startup work: none.",
            "**Callback-style clients** that keep one long-lived connection and dispatch responses from its `data` handler. You will meet one in the next lesson.",
            "**Process boundaries** (a queue, an HTTP call, a cron job): memory does not cross them. Only what you write into the message does.",
            "**No context manager at all.** If the SDK is never started in a process (or is started after the modules it should patch), `context.active()` is always the empty root context and every span is a new trace.",
        ]),
        p("For each of these there is one fix: **capture the context where the work is registered and restore it where the work runs.** Inside a process that means binding the callback (`context.bind(context.active(), fn)`); across a process it means serialising the context into the message (`propagation.inject`) and reading it back on the other side (`propagation.extract`), using the same W3C `traceparent` format as HTTP (lesson 1.3)."),
        h3("When not to"),
        bullets([
            "**Do not bind long-lived listeners to a request.** A listener registered once at startup for all requests (say, a metrics listener on the scanner) must not be bound to the first request that happens to register it, or every later event lands in that one trace.",
            "**Do not bind a whole shared emitter.** `context.bind(ctx, emitter)` makes every listener added later run in `ctx`. On an emitter shared by all requests, that is the same mistake on a larger scale. Bind the listener function instead.",
            "**Do not force every consumer into the producer's trace.** A job processed hours later, or a batch of jobs from many requests, is better connected with a **span link** than as a child (lesson 2.3). The job should still carry the context; what changes is how the worker uses it.",
        ]),

        challenge("chal_quiz_otl_211"),

        h2("4. Worked example: fixing each boundary"),
        p("Here is the producer side after the fix, in the NestJS service behind POST /submissions. The API calls are from `@opentelemetry/api` 1.x; the queue is BullMQ-like, so the context travels inside the job data. Recent BullMQ versions have their own optional telemetry integration: if you enable it, check what it writes into the job instead of adding a second carrier."),
        code("typescript", `
import { SpanKind, context, propagation, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("submissions-api");

async create(dto: CreateSubmissionDto): Promise<{ id: string }> {
  const submission = await this.repo.insert(dto);          // await: context follows by itself

  // EventEmitter: bind the listener to the context of THIS request, where it is registered
  this.scanner.once(\`scanned:\${submission.id}\`, context.bind(context.active(), (verdict: string) => {
    this.logger.info({ verdict, submission_id: submission.id }, "scan result");
  }));

  // In-house helper that drains callbacks from a boot-time timer: same fix
  this.rateWindow.onClose(context.bind(context.active(), () => {
    this.logger.info({ submission_id: submission.id }, "rate-limit window closed");
  }));

  // Queue: the context crosses the process boundary only inside the message
  await tracer.startActiveSpan("send grading", { kind: SpanKind.PRODUCER }, async (span) => {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);          // writes carrier.traceparent (and tracestate, baggage)
    await this.gradingQueue.add("grade", { submissionId: submission.id, otel: carrier });
    span.end();
  });
  return { id: submission.id };
}`, "submissions.service.ts"),
        p("And the consumer. The worker extracts the context from the job and starts its span with that context as the parent. If the job has no carrier (old jobs, a producer that was not updated), `extract` returns the root context and the worker simply starts a new trace, which is the correct fallback."),
        code("typescript", `
import { ROOT_CONTEXT, SpanKind, context, propagation, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("grading-worker");

new Worker("grading", async (job) => {
  const parent = propagation.extract(ROOT_CONTEXT, job.data.otel ?? {});
  return tracer.startActiveSpan("process grading", { kind: SpanKind.CONSUMER }, parent, async (span) => {
    try {
      const result = await grade(job.data.submissionId);   // logs inside carry the request's trace id
      await leaderboard.update(job.data.submissionId, result.score);
      return result;
    } finally {
      span.end();
    }
  });
});`, "grading.worker.ts"),
        p("Two details matter. `extract` starts from `ROOT_CONTEXT`, not from `context.active()`, so that whatever the worker loop happens to have active cannot leak into the job. And the SDK must be started in the worker process **before** the queue library and the logger are loaded (for example with `node --import ./otel.js dist/worker.js`; check the loading instructions of your SDK version), or the worker has no context manager and no log correlation."),
        callout("info", "Child or link?",
            "Making the worker span a child (as above) gives one trace from the click to the leaderboard, which is what support needs here because jobs normally run within seconds. The OpenTelemetry messaging conventions also allow a link from the consumer span to the producer's context instead, which is the better choice when a job can wait for hours or when one consumer span processes messages from many producers. Lesson 2.3 compares the two."),

        h2("5. The challenge: carry the context yourself"),
        p("The code runner has no OpenTelemetry SDK, so the challenge file contains a tiny tracer and a context store with the same two calls as above: `store.run(ctx, fn)` and `store.active()`. The store deliberately has **no async tracking**: a context is active only while `fn` runs synchronously. That makes every boundary visible, including the promise and the timer that AsyncLocalStorage would handle for you, so you write the capture-and-restore that a context manager performs."),
        bullets([
            "**`bind(fn)`** captures the active context when `bind` is called and runs `fn` in it later. The app code already wraps its promise callback, its timer, its scanner listener and the worker's leaderboard callback with it.",
            "**`inject(headers)`** writes the active span context as `traceparent`, version `00`, flags `01`.",
            "**`extract(headers)`** reads it back and validates it like the W3C spec: lowercase hex, ids that are not all zeros, version `00` only (the spec's best-effort parsing of future versions is out of scope). An invalid header means \"no parent\": start a new trace, never crash.",
        ]),
        p("The test runner sends several requests one after another, then lets the promises settle, fires the timers, has the antivirus poller report (from its own span), and runs the worker. It prints every span start with its parent and every log line with the context it saw. Run the starter first: every callback prints `no context` and every worker span starts a new trace, which is the incident in miniature."),
        challenge("chal_coding_otl_212"),

        h2("6. How to verify"),
        p("\"The trace looks connected now\" is one trace on one afternoon. Make it a test that fails on today's code, using the SDK's in-memory exporter:"),
        code("typescript", `
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const exporter = new InMemorySpanExporter();
// SDK 2.x takes the processors in the constructor; 1.x used provider.addSpanProcessor()
new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();

test("the worker span continues the request trace", async () => {
  await request(app).post("/submissions").send(validSubmission).expect(202);
  await runNextJob(gradingWorker);                       // test helper: process one job in-process

  const spans = exporter.getFinishedSpans();
  const send = spans.find((s) => s.name === "send grading")!;
  const work = spans.find((s) => s.name === "process grading")!;
  expect(work.spanContext().traceId).toBe(send.spanContext().traceId);
  // SDK 2.x: parentSpanContext; 1.x: parentSpanId
  expect(work.parentSpanContext?.spanId).toBe(send.spanContext().spanId);
});`, "grading.trace.test.ts"),
        bullets([
            "**Run two requests concurrently in the same test.** A fix that keeps \"the last context\" in a shared variable passes with one request and fails with two.",
            "**Check the logs, not only the spans.** Query the log store for `service = grading-worker AND trace_id IS NULL` (or the equivalent in your log tool) after a deploy: it should drop to the jobs enqueued before the deploy.",
            "**Look at one real job.** Open a job in the queue's admin UI or in Redis and confirm the carrier is there: `otel.traceparent` = `00-<32 hex>-<16 hex>-01`.",
            "**Test the fallback.** A job without a carrier must still be processed, as a new trace.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Capturing the context when the callback runs instead of when it is registered.** `() => context.with(context.active(), fn)` restores the context it is already in. Spot it: the callback still logs `no context` or the emitter's trace.",
            "**Keeping the captured context in a shared variable or on a singleton service.** The last request overwrites it and callbacks of earlier requests join the wrong trace. Spot it: two concurrent requests in a test, or traces that contain spans from two different submissions.",
            "**Passing the context through the queue as an object.** A context or span object does not survive serialisation; only the `traceparent` string does. Spot it: the job data shows `{}` or `[object Object]` where the carrier should be.",
            "**Trusting an incoming traceparent without validation.** A malformed or all-zero id must be ignored, not copied into your spans. Spot it: traces whose id is `00000000...` or that never end because many clients send the same id.",
            "**Starting the SDK after the modules it instruments.** The worker \"has tracing\" but no context propagation and no log correlation. Spot it: `context.active()` is the root context inside a span callback in a debug log line, or the queue and logger spans are missing entirely.",
        ]),

        h2("8. Summary"),
        numbered([
            "A span joins the trace of whatever context is active when it starts. AsyncLocalStorage carries the context through await, promises, timers and Node I/O by recording it when the work is created.",
            "It cannot follow callbacks that a library, emitter or in-house scheduler stores and calls later, nor cross a process: bind the callback where it is registered, and inject the context into the message and extract it in the consumer.",
            "Verify with spans and logs: same trace id, the producer span as parent, two concurrent requests in the test, and a carrier you can see in a real job.",
        ]),

        h2("Sources"),
        bullets([
            "OpenTelemetry: Context propagation - https://opentelemetry.io/docs/concepts/context-propagation/",
            "W3C Trace Context (traceparent) - https://www.w3.org/TR/trace-context/",
            "OpenTelemetry semantic conventions for messaging spans (producer and consumer spans, links) - opentelemetry.io/docs/specs/semconv/messaging/",
            "Node.js documentation: AsyncLocalStorage and AsyncResource - nodejs.org/api/async_context.html",
        ]),
    ],
});
