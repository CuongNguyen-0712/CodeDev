// Parallel and with timeouts, but every dependency is treated as critical:
// a queue outage takes the whole api out of rotation.
async function checkHealth(deps, opts) {
    const TIMEOUT = Symbol("timeout");
    const withTimeout = (run) => Promise.race([
        Promise.resolve().then(run),
        opts.sleep(opts.timeoutMs).then(() => TIMEOUT),
    ]);
    const names = ["db", "queue"];
    const results = await Promise.allSettled(names.map((name) => withTimeout(() => deps[name].ping())));
    const checks = {};
    results.forEach((result, i) => {
        checks[names[i]] = result.status === "rejected" ? "down" : result.value === TIMEOUT ? "timeout" : "up";
    });
    const healthy = Object.values(checks).every((c) => c === "up");
    return { status: healthy ? 200 : 503, body: { status: healthy ? "ok" : "down", checks } };
}
