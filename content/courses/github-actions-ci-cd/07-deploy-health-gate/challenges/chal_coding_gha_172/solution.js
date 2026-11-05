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
    // @piece rollout-release: Roll the new tag out on the server
    await io.rollout(release);
    // @end
    const deadline = io.now() + policy.timeoutMs;
    let streak = 0;
    let checks = 0;
    while (streak < policy.okInARow && io.now() < deadline) {
        // @piece ask-health: Ask /health once; no answer counts as down
        checks++;
        let answer = null;
        try {
            answer = await io.health();
        } catch {
            answer = null;
        }
        // @end
        // @piece count-healthy-streak: Count healthy answers in a row from the new version
        if (answer && answer.status === 200 && answer.version === release) streak++;
        else streak = 0;
        // @end
        if (streak < policy.okInARow) await io.sleep(policy.intervalMs);
    }

    // @piece report-deployed: Healthy: record the new version and pass the step
    if (streak >= policy.okInARow) {
        io.output("deployed", release);
        io.output("rolled_back", "false");
        io.summary(`${release} is live: ${streak} healthy checks in a row`);
        return { status: "deployed", version: release, checks, exitCode: 0 };
    }
    // @end
    // @piece no-previous: First deploy: nothing to roll back to
    if (previous === null) {
        io.output("rolled_back", "false");
        io.summary(`${release} failed its health gate and there is no previous version to restore`);
        return { status: "failed", version: release, checks, exitCode: 1 };
    }
    // @end
    // @piece roll-back: Unhealthy: restore the previous tag and fail the step
    await io.rollout(previous);
    io.output("deployed", previous);
    io.output("rolled_back", "true");
    io.summary(`${release} failed its health gate after ${checks} checks; rolled back to ${previous}`);
    return { status: "rolled_back", version: previous, checks, exitCode: 1 };
    // @end
}
