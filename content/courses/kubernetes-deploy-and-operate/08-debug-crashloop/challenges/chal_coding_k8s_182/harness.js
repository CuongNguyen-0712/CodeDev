// Harness: runs the learner's triage on one pod, its events and its logs.
// input:  { pod, events, logs: { current, previous } } (deep copies are passed)
// Output: { cause, evidence, next } as returned, or { error: <message> } when triage throws.
async function __harness(input) {
    const copy = (v) => JSON.parse(JSON.stringify(v));
    try {
        const out = triage(copy(input.pod), copy(input.events), copy(input.logs)) || {};
        return { cause: out.cause ?? null, evidence: out.evidence ?? null, next: out.next ?? null };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
