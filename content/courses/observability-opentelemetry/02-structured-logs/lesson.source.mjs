// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-1-2",
    title: "Structured logs with trace ids",
    slug: { _type: "slug", current: "structured-logs-with-trace-ids" },
    description:
        "A grading job failed and the worker logged \"Grading failed for submission\" with no id, an Error printed as {} and a learner's bearer token in full: nobody could join the line to the request that failed. Learn to write one JSON object per line with fixed fields, levels that control cost, child loggers that carry context, the active trace id and span id on every line, redaction at any depth and errors that keep their name and stack frame - and build that logger yourself against recorded calls.",
    estimatedTime: 35,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API, grading worker, pino, OpenTelemetry)",
        problem:
            "A learner reported that her submission for challenge c_17 stayed \"Grading...\" forever. Support had the submission id s_981 and the time. The worker's log for that minute had 300 lines like \"Grading failed for submission\" and \"[object Object]\", none with a submission id or a trace id, so nobody could tell which one was hers or which request created the job. While searching, the team found that the API's request logger printed full request headers, including learners' Authorization bearer tokens, into a log index that 40 people can read.",
    },

    content: [
        h2("1. The incident: a log line you cannot join"),
        p("The worker's error handling, as it was on the day of the report:"),
        code("typescript", `
// grading.worker.ts - before
try {
    const result = await this.grading.run(job.data.code, job.data.challengeId);
    await this.submissions.saveResult(job.data.submissionId, result);
} catch (err) {
    this.logger.error("Grading failed for submission", JSON.stringify(err));
}`, "grading.worker.ts"),
        p("And what it wrote, among 300 similar lines in the same minute:"),
        code("text", `
[Nest] 41  - 10/20/2026, 9:14:05 AM   ERROR [GradingWorker] Grading failed for submission
[Nest] 41  - 10/20/2026, 9:14:05 AM   ERROR [GradingWorker] {}`, "worker stdout"),
        p("Three separate failures hide in these two lines. The message has **no identifiers**: not the submission id, not the job id, not the trace id of the request that created the job. The error is **`{}`**: `JSON.stringify` only copies an object's own enumerable properties, and an `Error`'s `message` and `stack` are not enumerable. And the line is **text**: to filter by anything you need a regular expression that breaks the day someone rewords the message."),
        p("The fourth failure was in the API, found while searching:"),
        code("typescript", `
// submissions.controller.ts - before
this.logger.log(\`submit \${JSON.stringify({ body: dto, headers: req.headers })}\`);
// -> submit {"body":{...},"headers":{"authorization":"Bearer eyJhbGciOi...","cookie":"..."}}`, "submissions.controller.ts"),
        p("A bearer token in a log index is a credential anyone with read access can use until it expires. Logs are copied to more places, kept longer and read by more people than the database: treat what you write into them as published."),

        h2("2. Reproduce it in thirty seconds"),
        p("Both behaviours are plain JavaScript, so you can confirm them in a Node REPL before touching the logger:"),
        code("bash", `
$ node -e 'console.log(JSON.stringify(new TypeError("Cannot read properties of undefined")))'
{}
$ node -e 'const e = new TypeError("x"); console.log(Object.keys(e), e.stack.split("\\n")[1].trim())'
[] at [eval]:1:11`, "terminal"),
        p("And the join you could not do: search the worker's logs for the submission id the learner gave support."),
        code("bash", `
$ grep -c "s_981" worker-2026-10-20.log
0
$ grep -c "Grading failed" worker-2026-10-20.log
311`, "terminal"),
        p("Zero lines mention the submission; 311 say something failed. That is the definition of a log you cannot use: it tells you how often, which a metric does better, and not which, which is the only thing a log is for."),

        h2("3. Structured logging: one JSON object per line"),
        p("A **structured log** writes each record as one JSON object on one line, with field names that never change. The message stays short and human; everything you might filter or join on goes into its own field:"),
        code("json", `
{"time":"2026-10-20T09:14:05.112Z","level":"error","msg":"grading failed","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","span_id":"53995c3f42cd8ad8","challengeId":"c_17","err":{"name":"TypeError","message":"Cannot read properties of undefined (reading 'score')","stack":"at GradingWorker.grade (/app/dist/grading/grading.worker.js:42:17)"},"jobId":"g_77120","service":"grading-worker","submissionId":"s_981"}`, "worker stdout (after)"),
        p("Now `submissionId:\"s_981\"` finds the line, `trace_id` joins it to the request that created the job and to the API's lines, and `level:\"error\"` can be counted without parsing English. The rules that make this work:"),
        bullets([
            "**Fixed fields first, in a fixed order.** `time` (ISO 8601, UTC), `level`, `msg`, then `trace_id` and `span_id`. A reader scanning raw lines finds them in the same place every time; a parser does not care, a human does.",
            "**One record, one line.** A stack trace printed over 15 lines becomes 15 records in most log pipelines, and only the first has the level. JSON escaping keeps newlines inside strings; keep the stack short (the top frame is usually enough on the line; the full stack belongs on the span's exception event).",
            "**Same name, same meaning, everywhere.** `submissionId` in the API and `submission_id` in the worker are two fields. Agree on names (OpenTelemetry's semantic conventions are a good source for common ones) and stick to them.",
            "**Levels as numbers.** pino uses trace 10, debug 20, info 30, warn 40, error 50, fatal 60; a logger set to `info` writes 30 and above. Production usually runs at `info`; `debug` is for a limited time on a limited service, because log cost is per byte.",
            "**Context by child loggers.** Instead of repeating `submissionId` in every call, create `log = logger.child({ submissionId, jobId })` once per job. The child's **bindings** are merged into every line; when a call passes the same key, the call's value wins.",
        ]),
        callout("info", "When not to write JSON",
            "A CLI tool that prints to a person, or your terminal during local development, reads better as text. Keep JSON as the format the process writes in every deployed environment, and pretty-print it locally with a tool such as pino-pretty piped after the process - not by switching the logger's format based on a guess about the environment."),
        h3("The trace id belongs on every line"),
        p("The line is joinable because the logger reads the **active span** when it writes and copies its ids. In OpenTelemetry JS, `trace.getActiveSpan()` returns the span of the current async context (lesson 4 shows how that context survives `await` and queues), and `span.spanContext()` gives `traceId` and `spanId`. Read them at **write time**: a logger created at startup has no active span, and a child logger created in one request may write lines while handling another."),
        h3("Redaction and errors"),
        p("Two rules protect the people in your data and the person debugging at 2 a.m.:"),
        bullets([
            "**Redact by default, at any depth.** Keys such as `authorization`, `cookie`, `password` and `token` must be replaced wherever they appear: `req.headers.authorization` is as dangerous as a top-level `authorization`. Better still, do not log whole objects you did not build: log `{ method, url, userId }`, not `req`.",
            "**Serialize errors explicitly.** Keep `name`, `message` and the first stack frame. pino's standard `err` serializer does this for the `err` key; a hand-written logger has to check `instanceof Error` before it treats a value as a plain object.",
        ]),

        challenge("chal_quiz_otl_121"),

        h2("4. Worked example: pino with trace ids in the CodeDev API"),
        p("The API's logger after the fix. It uses pino options that exist today, but option names move between major versions, as do the OpenTelemetry helpers: check the pino and OpenTelemetry JS docs for your versions."),
        code("typescript", `
// src/logging/logger.ts
import pino from "pino";
import { trace } from "@opentelemetry/api";

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "codedev-api" },
    timestamp: pino.stdTimeFunctions.isoTime,          // "time":"2026-10-20T09:14:05.112Z"
    formatters: { level: (label) => ({ level: label }) }, // "level":"error" instead of 50
    // pino's redact takes PATHS: list every place a secret can appear, wildcards included
    redact: {
        paths: ["authorization", "*.authorization", "req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
        censor: "[REDACTED]",
    },
    // called for every line: the ids of the span that is active right now
    mixin() {
        const span = trace.getActiveSpan();
        if (!span) return {};
        const { traceId, spanId } = span.spanContext();
        return { trace_id: traceId, span_id: spanId };
    },
});`, "logger.ts"),
        p("OpenTelemetry also ships an instrumentation for pino that injects the same ids (`trace_id`, `span_id`, `trace_flags`) without a mixin; either works, as long as exactly one of them does it. The worker then creates one child per job and passes the error under `err`:"),
        code("typescript", `
// src/grading/grading.worker.ts - after
async process(job: Job<GradingJob>) {
    const log = logger.child({ submissionId: job.data.submissionId, jobId: job.id, challengeId: job.data.challengeId });
    log.info("grading started");
    try {
        const result = await this.grading.run(job.data.code, job.data.challengeId);
        await this.submissions.saveResult(job.data.submissionId, result);
        log.info({ passed: result.passed, durationMs: result.durationMs }, "grading finished");
    } catch (err) {
        log.error({ err }, "grading failed");   // name, message and stack via pino's err serializer
        throw err;                              // let the queue retry; logging is not handling
    }
}`, "grading.worker.ts"),
        p("And the controller logs what it needs instead of the whole request:"),
        code("typescript", `
this.logger.info(
    { userId: user.id, challengeId: dto.challengeId, language: dto.language, bytes: dto.code.length },
    "submission received",
);`, "submissions.controller.ts"),
        p("The exercise below builds the core of such a logger without pino, so every rule is yours to get right: field order, levels, bindings, the active span read at write time, redaction at any depth (by key name, case-insensitive - deliberately stricter than pino's paths), errors, undefined values and long strings. The runner replays a scripted sequence of calls on a fake clock and a stack of active spans, and compares the exact lines."),
        challenge("chal_coding_otl_122"),

        h2("5. How to verify your logs"),
        bullets([
            "**Unit-test the logger with an in-memory sink**, as the exercise does: a fixed clock, a fake active span, and the exact lines expected. Include one nested secret and one `Error` in the test - those are the two that break silently.",
            "**Every line must parse.** In CI, run the app for one request and pipe stdout through a check: `node -e` reading lines and calling `JSON.parse` on each fails the build on the first text line someone added with `console.log`.",
            "**Join one request end to end.** Send one `POST /submissions` in staging, take the `trace_id` from the API's line and query the log backend for it: you must get the API's lines and the worker's lines, and the trace UI must show the same id.",
            "**Search for secrets.** Query the log index for `Bearer `, `password` and your cookie name once after each release. Zero results is the only acceptable answer.",
            "**Watch the volume.** Bytes per minute per service, from the log backend or the collector, on a dashboard. A release that doubles it has a debug line or a whole object in a loop.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Logging an Error with `JSON.stringify` or a template string.** You get `{}` or `[object Object]`. Spot it: `\"err\":{}` or `[object Object]` in the index. Pass the error under `err` to a serializer that reads `name`, `message` and `stack`.",
            "**Assuming the redact list matches keys at any depth.** In pino it is a list of paths; `authorization` does not cover `req.headers.authorization`. Spot it: a test that logs a nested secret and checks the output, or a search for `Bearer ` in the index.",
            "**Reading the trace id when the logger is created.** A child logger built in a constructor or at startup keeps no span, or the wrong one. Spot it: lines on the request path without `trace_id`, or with the same `trace_id` across different requests.",
            "**Interpolating ids into the message.** `Grading failed for s_981` cannot be filtered or grouped. Spot it: messages that differ only by an id. Keep the message constant and put the id in a field.",
            "**Expensive arguments on a disabled level.** `log.debug({ summary: summarize(results) })` builds the summary even when debug is off. Spot it: the function in a production CPU profile. Guard it with a level check or remove it.",
        ]),

        h2("7. Summary"),
        bullets([
            "Write one JSON object per line with fixed fields first - time, level, msg, trace_id, span_id - and identifiers in their own fields, never inside the message.",
            "Read the active span's ids when the line is written, and carry request context with child loggers whose bindings the call's fields can override.",
            "Redact secrets at any depth, serialize errors to name, message and a stack frame, and use levels to control cost; test all of it with an in-memory sink.",
        ]),

        h2("Sources"),
        bullets([
            "OpenTelemetry, Signals - Logs, and the logs data model: opentelemetry.io/docs/concepts/signals/logs/",
            "pino documentation: redaction, serializers, formatters and mixin (getpino.io)",
            "OpenTelemetry JS: @opentelemetry/api trace.getActiveSpan() and the pino instrumentation (check the current docs)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a CI step to one of your services that starts it, sends one request and fails if any stdout line is not JSON, lacks trace_id on the request path, or contains \"Bearer \". Then write down your team's field names (userId or user_id?) in one place and fix the first three lines that disagree."),
    ],
});
