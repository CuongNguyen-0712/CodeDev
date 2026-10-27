import { readFileSync } from "node:fs";

// Keep the trace context across async work. Since the grading queue went live, the logs of the
// grading worker have no trace id and its "process grading" span starts a new trace, the
// callbacks of POST /submissions (a promise, a timer, the antivirus scan event) log without a
// trace id or with the trace of the antivirus poller, and nobody can follow one submission from
// the request to the leaderboard.
//
// The context store below is like AsyncLocalStorage without the async part: store.run(ctx, fn)
// makes ctx active only while fn runs synchronously, so every callback that runs later sees no
// context (or the context of whoever calls it) unless you carry the context to it yourself.
//
// Write the three helpers the app code already calls:
//   bind(fn)          capture the context that is active NOW and run fn in it later
//   inject(headers)   write the active span context as a W3C traceparent header
//   extract(headers)  read a traceparent back (null when it is missing or invalid)
// Do not change the store, the tracer, the app code or the test runner.

type SpanContext = { traceId: string; spanId: string };
type Headers = Record<string, string>;

// ---------------------------------------------------------------------------- your code

/** Returns a function that runs `fn` in the context that is active when bind() is called. */
function bind<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => store.run(store.active(), () => fn(...args));
}

/** Writes the active span context into `headers.traceparent` ("00-<trace id>-<span id>-01"). */
function inject(headers: Headers): void {
    const ctx = store.active();
    if (!ctx) return;
    headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-01`;
}

/** Reads `headers.traceparent`; returns null when the header is missing or invalid. */
function extract(headers: Headers): SpanContext | null {
    const value = headers.traceparent;
    if (value === undefined) return null;
    const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(value);
    if (!match) return null;
    const [, traceId, spanId] = match;
    if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
    return { traceId, spanId };
}

// ---------------------------------------------------- context store and tracer (do not change)
let current: SpanContext | undefined;
const store = {
    active: (): SpanContext | undefined => current,
    run<T>(ctx: SpanContext | undefined, fn: () => T): T {
        const previous = current;
        current = ctx;
        try {
            return fn();
        } finally {
            current = previous;
        }
    },
};

let traceCount = 0;
let spanCount = 0;
const newTraceId = (): string => "4bf92f3577b34da6a3ce929d0e0e" + (++traceCount).toString(16).padStart(4, "0");
const newSpanId = (): string => "00f067aa0ba9" + (++spanCount).toString(16).padStart(4, "0");

const out: string[] = [];
const tracer = {
    /** Starts a span as a child of the active context (or a new trace) and runs fn with it active. */
    startActiveSpan<T>(name: string, fn: () => T): T {
        const parent = store.active();
        const span: SpanContext = { traceId: parent ? parent.traceId : newTraceId(), spanId: newSpanId() };
        out.push(`span "${name}" trace=${span.traceId} span=${span.spanId} parent=${parent ? parent.spanId : "none"}`);
        return store.run(span, fn);
    },
};

function log(submissionId: string, what: string): void {
    const ctx = store.active();
    out.push(`${submissionId} ${what}: ${ctx ? `trace=${ctx.traceId} span=${ctx.spanId}` : "no context"}`);
}

// Fake timers: callbacks run later, from the scheduler, in whatever context the scheduler has.
const scheduler = {
    timers: [] as { at: number; seq: number; fn: () => void }[],
    setTimeout(fn: () => void, ms: number): void {
        scheduler.timers.push({ at: ms, seq: scheduler.timers.length, fn });
    },
    runAll(): void {
        const due = scheduler.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        scheduler.timers = [];
        for (const t of due) t.fn();
    },
};

// The antivirus scanner emits "scanned:<id>" from its own polling loop; listeners run in the emitter's context.
const scanner = {
    listeners: new Map<string, (verdict: string) => void>(),
    once(event: string, listener: (verdict: string) => void): void {
        scanner.listeners.set(event, listener);
    },
    emit(event: string, verdict: string): void {
        const listener = scanner.listeners.get(event);
        scanner.listeners.delete(event);
        if (listener) listener(verdict);
    },
};

type Job = { submissionId: string; headers: Headers };
const queue = { jobs: [] as Job[], add: (job: Job): void => void queue.jobs.push(job) };
const db = { insert: (_id: string): Promise<void> => Promise.resolve() };
const leaderboard = { update: (_id: string): Promise<void> => Promise.resolve() };

// ------------------------------------------------- app code: calls your helpers (do not change)
type Request = { id: string; traceparent?: string; timerMs: number; jobHeader?: string | null };

function handleSubmission(req: Request): void {
    const parent = req.traceparent === undefined ? null : extract({ traceparent: req.traceparent });
    store.run(parent ?? undefined, () =>
        tracer.startActiveSpan("POST /submissions", () => {
            log(req.id, "handler");
            db.insert(req.id).then(bind(() => log(req.id, "db.insert resolved")));
            scheduler.setTimeout(bind(() => log(req.id, "rate-limit timer fired")), req.timerMs);
            scanner.once(`scanned:${req.id}`, bind((verdict: string) => log(req.id, `scan ${verdict}`)));
            tracer.startActiveSpan("send grading", () => {
                const headers: Headers = {};
                inject(headers);
                queue.add({ submissionId: req.id, headers });
                log(req.id, `enqueued with traceparent ${headers.traceparent ?? "(none)"}`);
            });
        }),
    );
}

function worker(job: Job): void {
    const parent = extract(job.headers);
    store.run(parent ?? undefined, () =>
        tracer.startActiveSpan("process grading", () => {
            log(job.submissionId, "worker");
            leaderboard.update(job.submissionId).then(bind(() => log(job.submissionId, "leaderboard updated")));
        }),
    );
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "requests": [{ "id", "traceparent"?, "timerMs", "jobHeader"? }] }. The requests arrive one
// after another; then the promises settle, the timers fire, the scanner reports (newest upload first),
// and the worker processes the jobs in queue order. "jobHeader" replaces the traceparent of that job
// on its way through the queue (null removes it). Prints every span start and every log line.
async function main(): Promise<void> {
    const { requests }: { requests: Request[] } = JSON.parse(readFileSync(0, "utf8"));
    const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    for (const req of requests) handleSubmission(req);
    await settle();
    scheduler.runAll();
    tracer.startActiveSpan("antivirus.poll", () => {
        for (const req of [...requests].reverse()) scanner.emit(`scanned:${req.id}`, "clean");
    });
    for (const job of queue.jobs) {
        const req = requests.find((r) => r.id === job.submissionId);
        if (req && req.jobHeader === null) delete job.headers.traceparent;
        else if (req && typeof req.jobHeader === "string") job.headers.traceparent = req.jobHeader;
        worker(job);
    }
    await settle();
    console.log(out.join("\n"));
}
main();
