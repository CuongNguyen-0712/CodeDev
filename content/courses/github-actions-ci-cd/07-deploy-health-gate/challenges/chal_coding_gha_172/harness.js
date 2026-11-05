// Harness: runs the learner's gateDeploy against a scripted server and a fake clock.
// input:  { release, previous, policy: { intervalMs, timeoutMs, okInARow },
//           health: [answer, ...] }   answer = "refused" | { status, version }
// The script is read in order from the first health() after the first rollout; once it runs out
// the last answer repeats. Before any rollout the server answers with the previous version, and
// after a second rollout (a rollback) it answers with the tag rolled back to.
// Output: { result, rollouts, outputs, checksAt: clock of each health() call, elapsedMs, summary }
//      or { error: <message of the thrown error>, rollouts, outputs }.
async function __harness(input) {
    let clock = 0;
    let next = 0;
    const rollouts = [];
    const outputs = {};
    const summary = [];
    const checksAt = [];
    const io = {
        async rollout(tag) { rollouts.push(tag); },
        async health() {
            checksAt.push(clock);
            if (rollouts.length === 0) return { status: 200, version: input.previous };
            if (rollouts.length > 1) return { status: 200, version: rollouts[rollouts.length - 1] };
            const answer = input.health[Math.min(next++, input.health.length - 1)];
            if (answer === "refused") throw new Error("connect ECONNREFUSED 127.0.0.1:3000");
            return { ...answer };
        },
        async sleep(ms) { clock += ms; },
        now() { return clock; },
        output(name, value) { outputs[name] = String(value); },
        summary(line) { summary.push(String(line)); },
    };
    try {
        const result = await gateDeploy({
            release: input.release,
            previous: input.previous,
            policy: { ...input.policy },
        }, io);
        return { result: result === undefined ? null : result, rollouts, outputs, checksAt, elapsedMs: clock, summary: summary.length > 0 };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), rollouts, outputs };
    }
}
