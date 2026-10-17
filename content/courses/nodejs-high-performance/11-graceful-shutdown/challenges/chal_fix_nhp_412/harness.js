// Harness: Fix the shutdown order of the payments API
// Replays a deploy on a fake clock: requests start and finish at given times, SIGTERM
// calls shutdown(). The fake server behaves like node:http - close(cb) stops accepting
// and calls cb once no request is in flight; closeAllConnections() drops what is left.
// A request that finishes after db.end() fails with "pool closed".
// Output: { log: ["<ms> <event>", ...] in order, result: what the first shutdown() resolved with }
async function __harness(input) {
    const HORIZON_MS = 60000;
    let now = 0;
    let seq = 0;
    let queue = [];
    const log = [];
    const record = (event) => log.push(`${now} ${event}`);

    const clock = {
        setTimeout(fn, ms) {
            const timer = { id: ++seq, at: now + Math.max(0, Number(ms) || 0), fn };
            queue.push(timer);
            return timer.id;
        },
        clearTimeout(id) {
            queue = queue.filter((t) => t.id !== id);
        },
    };

    // --- fake database pool -------------------------------------------------------
    let dbEnded = false;
    const db = {
        async end() {
            record("db.end");
            dbEnded = true;
        },
    };

    // --- fake HTTP server ---------------------------------------------------------
    const inFlight = new Set();
    let accepting = true;
    let closeCallbacks = [];

    const notifyIfDrained = () => {
        if (accepting || inFlight.size > 0 || closeCallbacks.length === 0) return;
        const callbacks = closeCallbacks;
        closeCallbacks = [];
        Promise.resolve().then(() => callbacks.forEach((cb) => cb()));
    };

    const server = {
        close(callback) {
            record("server.close");
            accepting = false;
            if (typeof callback === "function") closeCallbacks.push(callback);
            notifyIfDrained();
        },
        closeAllConnections() {
            record("server.closeAllConnections");
            for (const id of inFlight) record(`${id} dropped`);
            inFlight.clear();
            notifyIfDrained();
        },
    };

    for (const request of input.requests || []) {
        clock.setTimeout(() => {
            if (!accepting) {
                record(`${request.id} refused`);
                return;
            }
            inFlight.add(request.id);
            if (request.duration === null || request.duration === undefined) return; // stuck forever
            clock.setTimeout(() => {
                if (!inFlight.has(request.id)) return; // already dropped
                record(dbEnded ? `${request.id} failed: pool closed` : `${request.id} done`);
                inFlight.delete(request.id);
                notifyIfDrained();
            }, request.duration);
        }, request.at);
    }

    // --- SIGTERM ------------------------------------------------------------------
    const shutdown = createShutdown({ server, db, timeoutMs: input.timeoutMs, timers: clock });
    let result = "pending";
    let first = true;
    for (const at of input.sigtermAt || []) {
        clock.setTimeout(() => {
            const isFirst = first;
            first = false;
            Promise.resolve()
                .then(() => shutdown())
                .then(
                    (value) => { if (isFirst) result = value; },
                    (error) => { if (isFirst) result = `error: ${error && error.message ? error.message : error}`; },
                );
        }, at);
    }

    // --- run the clock ------------------------------------------------------------
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    while (queue.length > 0) {
        queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = queue[0];
        if (next.at > HORIZON_MS) break;
        queue.shift();
        now = next.at;
        next.fn();
        await settle();
    }

    return { log, result };
}
