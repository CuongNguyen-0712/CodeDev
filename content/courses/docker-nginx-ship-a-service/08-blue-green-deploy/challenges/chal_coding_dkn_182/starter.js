// Rice Rocket deploy plan: switch blue <-> green behind nginx, with a rollback at every gate.
//
// state:   { active: "blue" | "green", candidateImage: "ricerocket/api:1.8.0", drainSeconds?: number }
// results: { healthy, configTest, reload, smoke } - what each check returns during this deploy
// return:  { actions: [...ordered steps], active: colour serving traffic at the end }
function planDeploy(state, results) {
    // [ ] Name the live colour and the candidate colour
    const actions = [];

    // 1. Start the candidate next to the live colour; traffic still goes to `live`.
    // [ ] Start the candidate and wait for its healthcheck

    // 2. Point the upstream file at the candidate and test it before nginx sees it.
    // [ ] Write the upstream file and test it

    // 3. Reload: new workers use `next`, old workers finish their requests on `live`.
    // [ ] Reload nginx onto the candidate

    // 4. Real traffic check; `live` is still running, so going back is one reload.
    // [ ] Smoke test through nginx, switch back on failure

    // 5. Only now retire the old colour, after its in-flight requests had time to finish.
    // [ ] Drain and stop the old colour
}
