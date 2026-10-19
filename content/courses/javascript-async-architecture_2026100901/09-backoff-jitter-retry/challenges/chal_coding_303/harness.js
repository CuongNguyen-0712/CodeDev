// Harness: retry engine with backoff, jitter and cancellation
// Runs retry() on a fake clock. Each call to fn takes its outcome from input.outcomes
// (the last one repeats): { value } resolves, { error: { status, message, retryAfterMs } }
// rejects with an HTTP-like Error, { error: { network: true } } rejects with
// TypeError("Failed to fetch"); with latencyMs the outcome arrives that much later and
// the call rejects with signal.reason if its signal aborts first.
// input.random is the sequence returned by random() (cycled); input.abortAt aborts the
// checkout signal at that clock time with an AbortError "Checkout cancelled".
// Output: how retry() settled and when, the clock time of every call, timers left behind.
async function __harness(input) {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    const fakeTimers = {
        setTimeout(callback, ms) {
            const id = ++seq;
            timers.set(id, { id, at: now + Math.max(0, Number(ms) || 0), callback });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
    };

    const sequence = input.random && input.random.length ? input.random : [0.5];
    let r = 0;
    const random = () => sequence[r++ % sequence.length];

    const controller = new AbortController();
    if (typeof input.abortAt === "number") {
        fakeTimers.setTimeout(() => controller.abort(new DOMException("Checkout cancelled", "AbortError")), input.abortAt);
    }

    function makeError(spec) {
        if (spec.network) return new TypeError("Failed to fetch");
        const error = new Error(spec.message || "HTTP " + spec.status);
        error.status = spec.status;
        if (typeof spec.retryAfterMs === "number") error.retryAfterMs = spec.retryAfterMs;
        return error;
    }

    const outcomes = input.outcomes || [{ value: "ok" }];
    const calls = [];
    function fn(ctx) {
        const signal = ctx && ctx.signal;
        const outcome = outcomes[Math.min(calls.length, outcomes.length - 1)];
        calls.push(now);
        if (!outcome.latencyMs) {
            return outcome.error ? Promise.reject(makeError(outcome.error)) : Promise.resolve(outcome.value);
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => { fakeTimers.clearTimeout(id); reject(signal.reason); };
            const id = fakeTimers.setTimeout(() => {
                if (signal) signal.removeEventListener("abort", onAbort);
                if (outcome.error) reject(makeError(outcome.error));
                else resolve(outcome.value);
            }, outcome.latencyMs);
            if (signal) signal.addEventListener("abort", onAbort, { once: true });
        });
    }

    let settled = null;
    Promise.resolve()
        .then(() => retry(fn, { ...(input.options || {}), random, timers: fakeTimers, signal: controller.signal }))
        .then(
            (value) => { settled = { at: now, outcome: "resolved:" + value }; },
            (error) => { settled = { at: now, outcome: "rejected:" + (error && error.name) + ":" + (error && error.message) }; },
        );

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    for (let guard = 0; guard < 500; guard++) {
        await flush();
        if (settled) break;
        let next = null;
        for (const timer of timers.values()) {
            if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        timers.delete(next.id);
        now = next.at;
        next.callback();
    }

    return {
        outcome: settled ? settled.outcome : "pending",
        calls,
        settledAt: settled ? settled.at : null,
        timersLeft: timers.size,
    };
}
