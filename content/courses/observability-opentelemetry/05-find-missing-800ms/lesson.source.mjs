// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-2-2",
    title: "Find the missing 800 ms: a trace with a hole in it",
    slug: { _type: "slug", current: "find-the-missing-800-ms-trace-with-a-hole" },
    description:
        "The course scenario. POST /submissions takes 1,240 ms, but its child spans add up to about 440 ms and the trace shows an 800 ms hole right after the cache lookup. Work through it like the on-call engineer: read the trace, the logs, the code and the Collector's own metrics, see that the time is not missing but recorded in another trace, rule out dropped spans and clock skew, fix the callback that loses the context, compute self time correctly, and prove the fix with the span tree.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Tuesday 14:20. The weekly latency review flags POST /submissions on https://api.codedev.test: p95 went from 450 ms to 1.3 s after the plagiarism check was added to the submit flow last Thursday. The team opens a slow trace to see where the time goes, and finds that the child spans cover only about a third of the request. The trace UI reports 800 ms of \"self time\" on the root span, a span whose own code does almost nothing. Someone says the Collector must be dropping spans; someone else suspects the clocks.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. A trace is supposed to explain latency, and this one does not: there is a hole in it the size of two thirds of the request. The most common reaction is to distrust the tracing pipeline. The method of this lesson is to treat the hole as evidence instead, and to keep asking \"where did those 800 ms go?\" until a piece of evidence answers."),
        p("A trace UI shows, for every span, its **duration** and its **self time**: the part of its duration that none of its children covers. A root span that only calls other things should have a self time of a few milliseconds. A large self time means one of two things: the span's own code is really doing work (CPU, a blocking call), or some of its work happened in an operation that has no child span in this trace."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected in the first twenty minutes. The quiz below refers to them by letter. All times are from the same request, submission `sub_9f2`, on Tuesday at 14:03:12."),
        h3("A. The slow trace"),
        code("text", `
Trace 4bf92f3577b34da6a3ce929d0e0e4736   service submissions-api   host api-7f9c
Span                              Start      End        Duration   Self time
POST /submissions                 0 ms       1,240 ms   1,240 ms   802 ms
  auth.verify                     1 ms       35 ms      34 ms      34 ms
  submissions.validate            35 ms      57 ms      22 ms      22 ms
  cache.get problem:p_42          57 ms      66 ms      9 ms       9 ms
  INSERT submissions              866 ms     1,124 ms   258 ms     258 ms
  send grading                    1,124 ms   1,239 ms   115 ms     115 ms`, "Tracing backend, trace view"),
        h3("B. A second trace with the same submission id"),
        code("text", `
Search: submission.id = sub_9f2

Trace 7d1c09e4b2a54f8e9c3b6a1d0f2e4c58   service submissions-api   host api-7f9c
Span                              Start            Duration   Parent
plagiarism.check                  14:03:12.066     800 ms     (none - root span)
  attributes: submission.id=sub_9f2  plagiarism.verdict=clean

Root spans named plagiarism.check, last 24 h:   18,412
Root spans named POST /submissions, last 24 h:  18,430`, "Tracing backend, search"),
        h3("C. The request's logs"),
        code("text", `
14:03:12.000 info  request started             trace_id=4bf92f35... route="POST /submissions" submission_id=sub_9f2
14:03:12.066 info  calling plagiarism service  trace_id=4bf92f35... submission_id=sub_9f2 bytes=1840
14:03:12.866 info  plagiarism verdict          submission_id=sub_9f2 verdict=clean took_ms=800
14:03:13.240 info  request finished            trace_id=4bf92f35... status=202 duration_ms=1240`, "Log store, submission_id = sub_9f2, service submissions-api"),
        h3("D. The code added last Thursday"),
        code("typescript", `
// submissions.service.ts
async create(dto: CreateSubmissionDto, user: User): Promise<{ id: string }> {
  await this.auth.verify(user);
  const id = this.validate(dto);
  const problem = await this.cache.get(\`problem:\${dto.problemId}\`);
  this.logger.info({ submission_id: id, bytes: dto.code.length }, "calling plagiarism service");
  const verdict = await this.checkPlagiarism(id, dto.code);
  await this.repo.insert({ id, userId: user.id, problemId: problem.id, verdict });
  await this.enqueueGrading(id);
  return { id };
}

private checkPlagiarism(submissionId: string, code: string): Promise<string> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    // @codedev/plagiarism-client 1.x: callback API, one connection opened at startup
    this.plagiarism.check({ code }, (err, result) => {
      // the client has no instrumentation: record the call now that we know how long it took
      const span = tracer.startSpan("plagiarism.check", { startTime, attributes: { "submission.id": submissionId } });
      if (err) span.setStatus({ code: SpanStatusCode.ERROR });
      else span.setAttribute("plagiarism.verdict", result.verdict);
      span.end();
      this.logger.info({ submission_id: submissionId, verdict: result?.verdict, took_ms: Date.now() - startTime }, "plagiarism verdict");
      err ? reject(err) : resolve(result.verdict);
    });
  });
}`, "PR #911 \"submissions: check plagiarism before grading\""),
        h3("E. The Collector's own metrics, 14:00-14:10"),
        code("text", `
otelcol_receiver_accepted_spans{receiver="otlp"}        1,284,120
otelcol_receiver_refused_spans{receiver="otlp"}         0
otelcol_exporter_sent_spans{exporter="otlp/traces"}     1,284,120
otelcol_exporter_send_failed_spans{exporter="otlp/traces"}  0
otelcol_exporter_queue_size{exporter="otlp/traces"}     12 (capacity 5,000)`, "Collector internal telemetry (metric names vary between Collector versions)"),

        h2("3. Read the evidence"),
        p("One line per piece, for what it **shows**:"),
        bullets([
            "**A**: the children of the root cover 34 + 22 + 9 + 258 + 115 = 438 ms of 1,240 ms. They do not overlap, so the uncovered time is 802 ms, which is the self time the UI shows. Almost all of it is one stretch: from the end of `cache.get` at 66 ms to the start of `INSERT submissions` at 866 ms.",
            "**B**: a `plagiarism.check` span exists. It starts 66 ms after the request, lasts 800 ms, carries the same submission id, comes from the same service and host, and has **no parent**: it is the root of its own trace. The counts show it is not one unlucky request: there is one such root trace per submission.",
            "**C**: the request called the plagiarism service at .066 and got the verdict at .866, 800 ms later. The line logged **inside the callback** has no `trace_id`: when it was written, no span was active.",
            "**D**: the span is created inside the callback of a callback-style client, with an explicit `startTime`. The code after `await this.checkPlagiarism(...)` runs as before.",
            "**E**: the Collector refused nothing and failed to send nothing; its queue is almost empty.",
        ]),

        h2("4. Hypothesis: the time is not missing, it is in another trace"),
        p("Put A, B and C on one timeline and the hole fills exactly: 66 ms to 866 ms in trace A is 14:03:12.066 to 14:03:12.866 in trace B and in the logs. The 800 ms were measured and recorded; the span was attached to the wrong place."),
        p("Why? `tracer.startSpan` takes its parent from `context.active()` at the moment it is called, and it is called inside the callback. The plagiarism client keeps **one connection opened at startup** and calls the callbacks from that connection's `data` handler. AsyncLocalStorage restores, for that handler, the context in which the connection was created: the boot sequence, where no span was active. So the span has no parent, the SDK gives it a new trace id, and the log line in the same callback has no trace id. Every submission repeats it, which explains the 18,412 root traces in B."),
        p("Why are `INSERT submissions` and `send grading` still in the right trace? Because they run after `await this.checkPlagiarism(...)`. An `await` continuation resumes in the context of the async function that awaited, no matter which code resolved the promise. Only the code **inside** the callback runs in the connection's context."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The Collector dropped the span.\"** E shows zero refused and zero failed spans and a nearly empty queue. More decisively, B shows the span **was** exported: it is in the backend, in another trace. A dropped span is absent everywhere; it does not turn up as a root with its own trace id, because the parent is decided in the process when the span starts, not by the Collector.",
            "**\"Clock skew between machines.\"** Skew shifts spans recorded on different hosts against each other. Every span in A and B, and every log line in C, comes from the same process on `api-7f9c`, read from the same clock. The log's `took_ms=800` and `duration_ms=1240` agree with the spans.",
            "**\"The event loop was blocked (GC, CPU work) for 800 ms.\"** A blocked loop would also leave a hole in A, but it would not produce a span in B with the same submission id and timing, and the request could not have logged the call at .066 and the verdict at .866 while blocked.",
        ]),
        callout("info", "A large self time is a question, not an answer",
            "Self time tells you where to look, not what happened. Here it points at an operation that is missing from the tree. In another trace it might point at real CPU work in the span itself, and then a profiler, not the tracing pipeline, is the next tool."),

        h2("5. Choose the fix"),
        p("Write the requirements down from the evidence before choosing code:"),
        bullets([
            "The plagiarism call appears as a child of `POST /submissions`, at the time it really happened.",
            "The log lines written in the callback carry the request's trace id.",
            "No separate `plagiarism.check` root traces are created.",
            "Two concurrent submissions never end up in each other's traces.",
        ]),
        p("Candidates, checked against the list:"),
        bullets([
            "**Bind the callback to the active context** with OpenTelemetry's `context.bind`, at the place where it is handed to `check`. The context is captured when `check` is called, inside the request, and restored when the connection calls back. It meets all four requirements with a one-line change, and it fixes the logs in the callback too.",
            "**Start the span before the call and end it in the callback.** `tracer.startActiveSpan(\"plagiarism.check\", { kind: SpanKind.CLIENT }, ...)` around the call takes the parent while the request context is still active, and the span exists even when the callback never comes (a hang shows up as an unfinished span instead of nothing). Combine it with the bind so the logs in the callback are correlated as well.",
            "**Keep \"the current request\" in a field of the service and use it in the callback.** NestJS services are singletons: the second request overwrites the field and the first request's span joins the second request's trace. Fails requirement 4.",
            "**Search the backend by submission id and leave the code.** It finds trace B by hand, once. It meets none of the requirements, and every trace-based latency breakdown and alert stays wrong.",
            "**Upgrade to a client that preserves context.** Libraries that use `AsyncResource` to dispatch callbacks, or a promise API, avoid the problem. A good follow-up, but check the claim with a test; do not assume it.",
        ]),

        challenge("chal_quiz_otl_221"),

        h2("6. The challenge: repair the trace and its self time"),
        p("The fix-bug challenge reproduces the incident in one file. Unlike the previous lesson, the context store here **is** an AsyncLocalStorage, with OpenTelemetry-like `context.active()`, `context.with()` and `context.bind()`: `await` and promises carry the context by themselves, exactly as in production. The plagiarism client is the same kind of library as in D: one connection, and its responses are dispatched from code that runs outside any request."),
        bullets([
            "**The handler** runs steps from the test input: spans with fake I/O on a fake clock, groups of spans in `Promise.all`, a step that is not awaited, and the plagiarism check.",
            "**The trace report** prints every trace as a tree: name, `[start..end]` and self time. Today it has a second bug: self time is the duration minus the **sum** of the children, which is wrong as soon as children run in parallel (it can even go negative) or outlive their parent.",
            "**Your job:** make the plagiarism span a child of the request that made the call, and compute self time as the part of the span that no child covers, counting overlapping children once and ignoring the part of a child that lies outside its parent.",
        ]),
        p("Run the starter first: its output has the hole, the orphan `plagiarism.check` root and a self time of 800 ms on the root, the same evidence as A and B."),
        challenge("chal_coding_otl_222"),

        h2("7. How to verify the fix"),
        bullets([
            "**A regression test on the span tree.** With the in-memory exporter, run one submission and assert that `plagiarism.check` has the trace id of `POST /submissions` and the root span as its parent. Run two concurrent submissions with different latencies and assert each check is under its own request.",
            "**One fresh trace after the deploy.** The plagiarism span is a child from about 66 ms to 866 ms, the children now cover the request, and the root's self time drops from about 800 ms to a few milliseconds.",
            "**The orphan count.** The number of new root spans named `plagiarism.check` drops to zero for requests served by the new version, while the `POST /submissions` count stays the same.",
            "**The logs.** `plagiarism verdict` lines carry the request's `trace_id`.",
            "**The latency question you started with.** With the span in place, the p95 regression is now attributed to the plagiarism call. That is a separate decision (a timeout, a cache of verdicts, running the check in the worker instead of the request), and now you have the evidence to make it.",
        ]),

        h2("8. Common mistakes in a missing-time incident"),
        bullets([
            "**Blaming the pipeline first.** Spot it: nobody has searched for the missing operation by an attribute (submission id, time window) before raising the Collector's limits. Dropped spans leave children with a missing parent; they do not create new root traces.",
            "**Reading self time as \"the root's own code is slow\".** Spot it: a span whose code only awaits other calls with hundreds of milliseconds of self time. Look for an operation without a child span.",
            "**Summing child durations.** Parallel children make the sum larger than the parent, and self time goes negative. Spot it: negative or zero self time on a span whose children run in `Promise.all`.",
            "**Fixing context with shared state.** A singleton field or module variable holding \"the current request\" works in a test with one request. Spot it: spans from two submissions in one trace under load.",
            "**Wrapping every line after the await in context.bind.** Spot it: A already shows those spans in the right trace. Bind the callback that loses the context, not the code that never lost it.",
        ]),

        h2("9. Summary"),
        numbered([
            "A hole in a trace plus a large self time means \"an operation without a child span here\". Search for it by attributes and time before blaming the Collector or the clocks.",
            "A span created in a callback that a library calls from its own connection takes that connection's context: none, so it becomes a new root trace. Bind the callback (or start the span before the call) so it takes the request's context.",
            "Self time is the span's duration minus the union of its children, clipped to the span. Verify the fix with the span tree, the orphan count and the log correlation.",
        ]),

        h2("Sources"),
        bullets([
            "OpenTelemetry: Context propagation - https://opentelemetry.io/docs/concepts/context-propagation/",
            "OpenTelemetry concepts: Signals, traces and spans - https://opentelemetry.io/docs/concepts/signals/",
            "OpenTelemetry JS: context API and context managers (context.with, context.bind) - opentelemetry.io/docs/languages/js/context/",
            "OpenTelemetry Collector: internal telemetry - opentelemetry.io/docs/collector/internal-telemetry/",
        ]),
        callout("tip", "Self-practice (not graded): write the incident timeline",
            "Write the timeline of this incident as you would post it in the incident channel: when the plagiarism check shipped, when the p95 regression was noticed, the first (wrong) hypotheses and the evidence that ruled each one out (E for the Collector, the single host for clock skew), the moment trace B was found by submission id, the root cause in one sentence, the fix and its deploy time, and the checks that confirmed it (one fresh trace, the orphan count, the log correlation). End with two follow-ups: a regression test on the span tree, and a decision on the 800 ms itself."),
    ],
});
