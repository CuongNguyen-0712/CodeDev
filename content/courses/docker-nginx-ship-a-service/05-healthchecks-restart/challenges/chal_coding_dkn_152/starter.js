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
    // [ ] Give each check its time budget

    const names = ["db", "queue"];
    // [ ] Run both checks at the same time

    const checks = {};
    // [ ] Report each check as up, down or timeout

    // [ ] Decide the status: db is critical, the queue is not
}
