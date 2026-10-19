// Harness: loadDashboard with required / optional sources and per-source timeouts.
// Every source is simulated on a fake clock the harness controls. input.sources[i]:
//   { name, required?, timeoutMs?, fallback?, after: ms, value }   -> resolves with value after `after` ms
//   { name, ..., after: ms, error: "HTTP 500" }                    -> rejects with new Error(error)
//   { name, ..., never: true }                                     -> never settles
//   { name, ..., throws: "message" }                               -> load() throws synchronously
// The clock jumps from timer to timer; between two timers every pending promise callback runs.
// Output when loadDashboard settles:
//   { outcome: "resolved", at, data, errors, pendingTimers }  (pendingTimers = your timers still scheduled)
//   { outcome: "rejected", at, error }
async function __harness(input) {
    let now = 0;
    let seq = 0;
    const queue = new Map();

    function schedule(callback, ms, owner) {
        const id = ++seq;
        queue.set(id, { id, at: now + Math.max(0, Number(ms) || 0), callback, owner });
        return id;
    }

    const timers = {
        setTimeout(callback, ms) {
            return schedule(callback, ms, "learner");
        },
        clearTimeout(id) {
            const timer = queue.get(id);
            if (timer && timer.owner === "learner") queue.delete(id);
        },
        now() {
            return now;
        },
    };

    const pendingLearnerTimers = () => [...queue.values()].filter((t) => t.owner === "learner").length;

    const sources = (input.sources || []).map((spec) => {
        const source = {
            name: spec.name,
            load() {
                if (spec.throws) throw new Error(spec.throws);
                return new Promise((resolve, reject) => {
                    if (spec.never) return;
                    schedule(() => (spec.error ? reject(new Error(spec.error)) : resolve(spec.value)), spec.after, "network");
                });
            },
        };
        if (spec.required) source.required = true;
        if (typeof spec.timeoutMs === "number") source.timeoutMs = spec.timeoutMs;
        if ("fallback" in spec) source.fallback = spec.fallback;
        return source;
    });

    let settled = null;
    let promise;
    try {
        promise = Promise.resolve(loadDashboard(sources, timers));
    } catch (error) {
        promise = Promise.reject(error);
    }
    promise.then(
        (value) => {
            settled = {
                outcome: "resolved",
                at: now,
                data: value && value.data,
                errors: value && value.errors,
                pendingTimers: pendingLearnerTimers(),
            };
        },
        (error) => {
            settled = { outcome: "rejected", at: now, error: error && error.message ? error.message : String(error) };
        },
    );

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    for (let guard = 0; guard < 500 && !settled; guard++) {
        let next = null;
        for (const timer of queue.values()) {
            if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        queue.delete(next.id);
        now = next.at;
        next.callback();
        await tick();
    }

    return settled || { outcome: "still pending", at: now };
}
