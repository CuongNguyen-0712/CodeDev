// Rice Rocket deploy plan: switch blue <-> green behind nginx, with a rollback at every gate.
//
// state:   { active: "blue" | "green", candidateImage: "ricerocket/api:1.8.0", drainSeconds?: number }
// results: { healthy, configTest, reload, smoke } - what each check returns during this deploy
// return:  { actions: [...ordered steps], active: colour serving traffic at the end }
function planDeploy(state, results) {
    // @piece pick-colours: Name the live colour and the candidate colour
    const live = state.active;
    const next = live === "blue" ? "green" : "blue";
    // @end
    const actions = [];

    // 1. Start the candidate next to the live colour; traffic still goes to `live`.
    // @piece health-gate: Start the candidate and wait for its healthcheck
    actions.push(`start ${next} ${state.candidateImage}`, `wait healthy ${next}`);
    if (!results.healthy) {
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    // @end

    // 2. Point the upstream file at the candidate and test it before nginx sees it.
    // @piece config-test: Write the upstream file and test it
    actions.push(`write upstream ${next}`, "nginx -t");
    if (!results.configTest) {
        actions.push(`write upstream ${live}`, `stop ${next}`);
        return { actions, active: live };
    }
    // @end

    // 3. Reload: new workers use `next`, old workers finish their requests on `live`.
    // @piece reload: Reload nginx onto the candidate
    actions.push("reload nginx");
    if (!results.reload) {
        actions.push(`write upstream ${live}`, `stop ${next}`);
        return { actions, active: live };
    }
    // @end

    // 4. Real traffic check; `live` is still running, so going back is one reload.
    // @piece smoke-test: Smoke test through nginx, switch back on failure
    actions.push(`smoke test ${next}`);
    if (!results.smoke) {
        actions.push(`write upstream ${live}`, "nginx -t", "reload nginx", `stop ${next}`);
        return { actions, active: live };
    }
    // @end

    // 5. Only now retire the old colour, after its in-flight requests had time to finish.
    // @piece retire-old: Drain and stop the old colour
    actions.push(`drain ${live} ${state.drainSeconds ?? 30}s`, `stop ${live}`);
    return { actions, active: next };
    // @end
}
