// Harness: calls the learner's checkHealth(deps, opts) with fake dependencies on a fake clock.
// input: { db: { ping, afterMs }, queue: { ping, afterMs }, timeoutMs }
//   ping: "resolve" | "reject" (rejects after afterMs) | "throw" (throws synchronously when called)
//   a "hung" dependency is { ping: "resolve", afterMs: 30000 }: it answers after 30 s of fake time.
// opts.sleep(ms) returns a promise that resolves after ms of fake time. Nothing waits for real:
// the harness flushes microtasks, then jumps the clock to the next pending timer.
// Output: { status, body, elapsedMs } where elapsedMs is the fake time at which checkHealth returned.

function fakeClock() {
    let now = 0;
    let seq = 0;
    const timers = [];
    return {
        now: () => now,
        sleep(ms) {
            return new Promise((resolve) => timers.push({ at: now + Math.max(0, Number(ms) || 0), seq: seq++, resolve }));
        },
        next() {
            if (!timers.length) return false;
            timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
            const t = timers.shift();
            now = t.at;
            t.resolve();
            return true;
        },
    };
}

function fakeDep(spec, clock) {
    const { ping = "resolve", afterMs = 5 } = spec || {};
    return {
        ping() {
            if (ping === "throw") throw new Error("pool is closed");
            return clock.sleep(afterMs).then(() => {
                if (ping === "reject") throw new Error("connect ECONNREFUSED");
                return "PONG";
            });
        },
    };
}

async function flush() {
    for (let i = 0; i < 200; i++) await Promise.resolve();
}

async function __harness(input) {
    const clock = fakeClock();
    const deps = { db: fakeDep(input.db, clock), queue: fakeDep(input.queue, clock) };
    const opts = { timeoutMs: input.timeoutMs, sleep: clock.sleep };
    let done = false;
    let value;
    let error = null;
    let elapsedMs = null;
    Promise.resolve()
        .then(() => checkHealth(deps, opts))
        .then((v) => { value = v; }, (e) => { error = e; })
        .finally(() => { done = true; elapsedMs = clock.now(); });
    for (let steps = 0; steps < 10000; steps++) {
        await flush();
        if (done || clock.now() > 120000 || !clock.next()) break;
    }
    await flush();
    if (!done) return { error: "checkHealth never returned (it awaits something that never settles)" };
    if (error) return { error: `checkHealth threw: ${error && error.message}` };
    return { status: value && value.status, body: value && value.body, elapsedMs };
}
