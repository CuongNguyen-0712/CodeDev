// Harness: Fix the leaking timeout around an outbound HTTP call
// Runs callWithTimeout() on a fake clock. The fake request resolves (or fails) after
// `latencyMs` of fake time and, like fetch, rejects with AbortError and cancels its own
// timer as soon as its signal is aborted. Output per call:
//   outcome       -> "ok" | the error code that callWithTimeout rejected with
//   at            -> fake time at which callWithTimeout settled
//   aborted       -> whether the request's signal was aborted
//   pendingTimers -> timers still scheduled right after it settled (leaks)
async function __harness(input) {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    let now = 0;
    let seq = 0;
    const timers = new Map(); // id -> { at, cb }
    const clock = {
        setTimeout(cb, ms) {
            const id = ++seq;
            timers.set(id, { at: now + Math.max(0, Number(ms) || 0), cb });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
    };

    const runCall = async (call) => {
        let signalSeen = null;
        const request = (signal) => new Promise((resolve, reject) => {
            signalSeen = signal || null;
            const id = clock.setTimeout(() => {
                if (call.fail) reject(Object.assign(new Error(call.fail), { code: call.fail }));
                else resolve({ score: 12 });
            }, call.latencyMs);
            if (signal && typeof signal.addEventListener === "function") {
                signal.addEventListener("abort", () => {
                    clock.clearTimeout(id);
                    // Like fetch: the AbortError arrives asynchronously, after abort() returns.
                    Promise.resolve().then(() => reject(Object.assign(new Error("AbortError"), { name: "AbortError", code: "ABORT_ERR" })));
                });
            }
        });

        let settled = null;
        callWithTimeout(request, call.timeoutMs, clock).then(
            (value) => { settled = { outcome: value && value.score === 12 ? "ok" : "invalid", at: now }; },
            (error) => { settled = { outcome: (error && (error.code || error.message)) || "invalid", at: now }; },
        );

        await flush();
        // Advance fake time timer by timer until the call settles (or nothing is left).
        while (!settled && timers.size > 0) {
            const [id, next] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            timers.delete(id);
            now = Math.max(now, next.at);
            next.cb();
            await flush();
        }
        if (!settled) return { outcome: "never settled" };

        return {
            outcome: settled.outcome,
            at: settled.at,
            aborted: Boolean(signalSeen && signalSeen.aborted),
            pendingTimers: timers.size,
        };
    };

    const results = [];
    for (const call of input.calls || []) {
        results.push(await runCall(call));
    }
    return { results, leakedTimers: timers.size };
}
