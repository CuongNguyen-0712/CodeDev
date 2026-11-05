// GET /health for the Rice Rocket api. Docker's healthcheck and the deploy gate read it.
//
// deps.db.ping() and deps.queue.ping() return promises (a ping can also throw).
// opts.timeoutMs is the time budget of each check.
// opts.sleep(ms) returns a promise that resolves after ms: use it instead of setTimeout.
//
// Return { status: 200 | 503, body: { status: "ok" | "degraded" | "down",
//                                     checks: { db: "up" | "down" | "timeout", queue: ... } } }
async function checkHealth(deps, opts) {
    const TIMEOUT = Symbol("timeout");
    // Resolves with the check's result, or with TIMEOUT once opts.timeoutMs has passed.
    // A ping that throws synchronously must still become a rejection.
    // @piece with-timeout: Give each check its time budget
    const withTimeout = (run) => Promise.race([
        Promise.resolve().then(run),
        opts.sleep(opts.timeoutMs).then(() => TIMEOUT),
    ]);
    // @end

    const names = ["db", "queue"];
    // @piece run-in-parallel: Run both checks at the same time
    const results = await Promise.allSettled(names.map((name) => withTimeout(() => deps[name].ping())));
    // @end

    const checks = {};
    // @piece map-results: Report each check as up, down or timeout
    results.forEach((result, i) => {
        checks[names[i]] = result.status === "rejected" ? "down" : result.value === TIMEOUT ? "timeout" : "up";
    });
    // @end

    // @piece decide-status: Decide the status: db is critical, the queue is not
    if (checks.db !== "up") return { status: 503, body: { status: "down", checks } };
    return { status: 200, body: { status: checks.queue === "up" ? "ok" : "degraded", checks } };
    // @end
}
