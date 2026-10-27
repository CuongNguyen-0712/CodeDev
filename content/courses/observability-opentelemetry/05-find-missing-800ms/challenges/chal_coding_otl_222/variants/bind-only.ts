import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";

// Find the Missing 800 ms. The trace of POST /submissions is 1,240 ms long but its child spans
// cover only about 440 ms: there is a hole right after the cache lookup. The logs of the same
// request show a call to the plagiarism service there, and the tracing backend shows a separate
// trace, rooted at "plagiarism.check", with the same submission id and the same timing.
// On top of that, the "self time" column of our trace report is wrong for spans whose
// children run in parallel or outlive them.
//
// Fix checkPlagiarism so that its span is a child of the request that made the call, and fix
// selfTime so that each span's self time is the part of its own duration that none of its
// children covers. The test runner prints every trace as a span tree with start, end and self
// time. Do not change the context, the tracer, the clock, the plagiarism client or the runner.

// -------------------------------------------------------------------- app code (you may change)

/** Calls the plagiarism service (a callback-style client) and records the call as a span. */
function checkPlagiarism(submissionId: string): Promise<string> {
    const startTime = clock.now();
    return new Promise((resolve) => {
        plagiarismClient.check(submissionId, context.bind(context.active(), (verdict: string) => {
            // the client has no instrumentation: record its call as a span now that we know how long it took
            const span = tracer.startSpan("plagiarism.check", { startTime });
            span.setAttribute("submission.id", submissionId);
            span.setAttribute("plagiarism.verdict", verdict);
            span.end();
            resolve(verdict);
        }));
    });
}

/** Self time of a span: the part of [startTime, endTime] that none of its children covers. */
function selfTime(span: Span, children: Span[]): number {
    let childTime = 0;
    for (const child of children) childTime += child.endTime - child.startTime;
    return span.endTime - span.startTime - childTime;
}

// The handler: each step is a span with fake I/O ("name:ms"), a group of spans run with
// Promise.all ([...]), the plagiarism check ("plagiarism"), or a step that is not awaited ("&...").
type Step = string | string[];

async function handleSubmission(sub: Submission): Promise<void> {
    await tracer.startActiveSpan("POST /submissions", async (root) => {
        root.setAttribute("submission.id", sub.id);
        for (const step of sub.steps) {
            if (Array.isArray(step)) await Promise.all(step.map((s) => run(sub, s)));
            else if (step.startsWith("&")) void run(sub, step.slice(1));
            else await run(sub, step);
        }
        root.end();
    });
}

async function run(sub: Submission, step: string): Promise<void> {
    if (step === "plagiarism") {
        await checkPlagiarism(sub.id);
        return;
    }
    const [name, ms] = step.split(":");
    await tracer.startActiveSpan(name, async (span) => {
        await clock.sleep(Number(ms));
        span.end();
    });
}

// ------------------------------------------------- context, tracer, clock, client (do not change)
type SpanContext = { traceId: string; spanId: string };
type Span = {
    name: string; traceId: string; spanId: string; parentSpanId: string | null;
    startTime: number; endTime: number; attributes: Record<string, string>;
    setAttribute(key: string, value: string): void; end(): void;
};

// Like OpenTelemetry's context API on top of AsyncLocalStorage: the context follows await,
// promises and timers by itself, but not a callback that a library stores and calls later.
const storage = new AsyncLocalStorage<SpanContext>();
const context = {
    active: (): SpanContext | undefined => storage.getStore(),
    with: <T>(ctx: SpanContext | undefined, fn: () => T): T => storage.run(ctx as SpanContext, fn),
    bind<A extends unknown[], R>(ctx: SpanContext | undefined, fn: (...args: A) => R): (...args: A) => R {
        return (...args: A): R => storage.run(ctx as SpanContext, () => fn(...args));
    },
};

// Fake clock: sleep() resolves when the runner moves time forward.
const clock = {
    time: 0,
    timers: [] as { at: number; seq: number; fn: () => void }[],
    seq: 0,
    now: (): number => clock.time,
    sleep: (ms: number): Promise<void> => new Promise((resolve) => clock.at(clock.time + ms, resolve)),
    at(time: number, fn: () => void): void {
        clock.timers.push({ at: time, seq: clock.seq++, fn });
    },
};

let traceCount = 0;
let spanCount = 0;
const spans: Span[] = [];
const tracer = {
    /** Starts a span whose parent is the active context; startTime defaults to now. */
    startSpan(name: string, options: { startTime?: number } = {}): Span {
        const parent = context.active();
        const span: Span = {
            name,
            traceId: parent ? parent.traceId : `t${++traceCount}`,
            spanId: `s${++spanCount}`,
            parentSpanId: parent ? parent.spanId : null,
            startTime: options.startTime ?? clock.now(),
            endTime: -1,
            attributes: {},
            setAttribute(key, value) { span.attributes[key] = value; },
            end() { span.endTime = clock.now(); },
        };
        spans.push(span);
        return span;
    },
    /** Starts a span and runs fn with it as the active context. */
    startActiveSpan<T>(name: string, fn: (span: Span) => T): T {
        const span = tracer.startSpan(name);
        return context.with({ traceId: span.traceId, spanId: span.spanId }, () => fn(span));
    },
};

// The plagiarism client keeps one connection, opened at startup. Like a real socket, the code
// that reads the responses runs in the context the connection was opened in (none), not in the
// context of the request that sent the call.
const plagiarismClient = {
    latency: new Map<string, number>(),
    pending: new Map<string, (verdict: string) => void>(),
    check(submissionId: string, callback: (verdict: string) => void): void {
        plagiarismClient.pending.set(submissionId, callback);
        const ms = plagiarismClient.latency.get(submissionId) ?? 0;
        connection.write(submissionId, ms);
    },
};
const connection = {
    write(submissionId: string, ms: number): void {
        clock.at(clock.now() + ms, () => connection.onData(submissionId));
    },
    onData(submissionId: string): void {
        const callback = plagiarismClient.pending.get(submissionId);
        plagiarismClient.pending.delete(submissionId);
        if (callback) callback("clean");
    },
};

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "submissions": [{ "id", "startAt", "plagiarismMs", "steps": [...] }] }.
// Each submission starts at "startAt" (fake ms) with no active context. Prints each trace as a
// tree: name, submission id when the span has one, [start..end] and self time; children are
// sorted by start, then end, then name.
type Submission = { id: string; startAt: number; plagiarismMs: number; steps: Step[] };

const byStart = (a: Span, b: Span): number =>
    a.startTime - b.startTime || a.endTime - b.endTime || a.name.localeCompare(b.name)
    || (a.attributes["submission.id"] ?? "").localeCompare(b.attributes["submission.id"] ?? "");

function printTree(span: Span, depth: number, lines: string[]): void {
    const children = spans
        .filter((s) => s.parentSpanId === span.spanId && s.traceId === span.traceId)
        .sort(byStart);
    const id = span.attributes["submission.id"] ? ` ${span.attributes["submission.id"]}` : "";
    lines.push(`${"  ".repeat(depth)}${span.name}${id} [${span.startTime}..${span.endTime}] self=${selfTime(span, children)}`);
    for (const child of children) printTree(child, depth + 1, lines);
}

async function main(): Promise<void> {
    const { submissions }: { submissions: Submission[] } = JSON.parse(readFileSync(0, "utf8"));
    const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    for (const sub of submissions) {
        plagiarismClient.latency.set(sub.id, sub.plagiarismMs);
        clock.at(sub.startAt, () => void handleSubmission(sub));
    }
    for (;;) {
        await settle();
        const next = clock.timers.sort((a, b) => a.at - b.at || a.seq - b.seq).shift();
        if (!next) break;
        clock.time = next.at;
        next.fn();
    }
    const roots = spans
        .filter((s) => s.parentSpanId === null)
        .sort(byStart);
    const lines: string[] = [];
    for (const root of roots) printTree(root, 0, lines);
    console.log(lines.join("\n"));
}
main();
