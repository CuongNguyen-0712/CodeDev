// Fixes the swallowed db error and adds a timeout, but still checks one dependency after the other,
// and calls ping() outside the guarded promise.
async function checkHealth(deps, opts) {
    const check = async (promise) => {
        const timer = opts.sleep(opts.timeoutMs).then(() => "timeout");
        try {
            const r = await Promise.race([promise, timer]);
            return r === "timeout" ? "timeout" : "up";
        } catch (err) {
            return "down";
        }
    };
    const db = await check(deps.db.ping());
    const queue = await check(deps.queue.ping());
    if (db !== "up") return { status: 503, body: { status: "down", checks: { db, queue } } };
    return { status: 200, body: { status: queue === "up" ? "ok" : "degraded", checks: { db, queue } } };
}
