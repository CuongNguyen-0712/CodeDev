// Harness: runs the learner's planNode on one node and a list of pods.
// input:  { node, pods } as described at the top of plan-node.js (deep copies are passed).
// Output: { scheduled, pending, qos, containers, evictionOrder } as returned,
//      or { error: <message> } when planNode throws.
async function __harness(input) {
    const copy = (v) => JSON.parse(JSON.stringify(v));
    try {
        const out = planNode(copy(input.node), copy(input.pods)) || {};
        return {
            scheduled: out.scheduled ?? null,
            pending: out.pending ?? null,
            qos: out.qos ?? null,
            containers: out.containers ?? null,
            evictionOrder: out.evictionOrder ?? null,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
