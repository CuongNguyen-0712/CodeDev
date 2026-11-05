// Harness: runs the learner's planDeploy on one deploy scenario.
// input: { state: { active, candidateImage, drainSeconds? }, results: { healthy, configTest, reload, smoke } }
// output: { actions, active } as returned (copies are passed, so mutating them changes nothing).
async function __harness(input) {
    const state = JSON.parse(JSON.stringify(input.state));
    const results = JSON.parse(JSON.stringify(input.results));
    const out = planDeploy(state, results);
    return { actions: out && out.actions, active: out && out.active };
}
