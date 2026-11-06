// Harness: runs the learner's checkBudgets on one CI report (copies of the inputs, so mutating them
// changes nothing). input: { report, baseline, config }. Output: the returned { status, lines }
// or { error }.
async function __harness(input) {
    const copy = (v) => JSON.parse(JSON.stringify(v));
    try {
        const out = checkBudgets(copy(input.report), copy(input.baseline), copy(input.config));
        return { status: out && out.status, lines: out && out.lines };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
