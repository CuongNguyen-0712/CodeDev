// deploy/gate.js: the deploy job runs it on the VPS after `docker compose pull`.
// It ships the new tag, waits until /health proves the NEW version is up, and otherwise puts the
// previous tag back and fails the step, so the run turns red.
//
// release:  tag to ship, e.g. "1.4.0"; previous: tag running now, or null on a first deploy
// policy:   { intervalMs, timeoutMs, okInARow }
// io:       { rollout(tag), health() -> { status, version } (throws when nothing answers),
//             sleep(ms), now(), output(name, value), summary(line) }
// return:   { status: "deployed" | "rolled_back" | "failed", version, checks, exitCode }
async function gateDeploy({ release, previous, policy }, io) {
    // [ ] Roll the new tag out on the server
    const deadline = io.now() + policy.timeoutMs;
    let streak = 0;
    let checks = 0;
    while (streak < policy.okInARow && io.now() < deadline) {
        // [ ] Ask /health once; no answer counts as down
        // [ ] Count healthy answers in a row from the new version
        if (streak < policy.okInARow) await io.sleep(policy.intervalMs);
    }

    // [ ] Healthy: record the new version and pass the step
    // [ ] First deploy: nothing to roll back to
    // [ ] Unhealthy: restore the previous tag and fail the step
}
