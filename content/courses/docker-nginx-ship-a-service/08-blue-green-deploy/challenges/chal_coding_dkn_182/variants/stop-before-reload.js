// Retires the old colour as soon as the config test passes: blue is gone before nginx switches.
function planDeploy(state, results) {
    const live = state.active;
    const next = live === "blue" ? "green" : "blue";
    const actions = [`start ${next} ${state.candidateImage}`, `wait healthy ${next}`];
    if (!results.healthy) {
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`write upstream ${next}`, "nginx -t");
    if (!results.configTest) {
        actions.push(`write upstream ${live}`, `stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`drain ${live} ${state.drainSeconds ?? 30}s`, `stop ${live}`, "reload nginx", `smoke test ${next}`);
    return { actions, active: next };
}
