// Harness: runs the learner's summarize() on one batch of RUM beacons.
// input:  { beacons: [{ page, name, id, value, target }, ...] }  (a copy is passed)
// output: the returned summary, or { error } when it throws.
async function __harness(input) {
    try {
        const result = summarize(JSON.parse(JSON.stringify(input.beacons)));
        return result === undefined ? null : result;
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
