// Trusts the reload to catch a bad file: no nginx -t, no restore of the upstream file.
function planDeploy(state, results) {
    const live = state.active;
    const next = live === "blue" ? "green" : "blue";
    const actions = [`start ${next} ${state.candidateImage}`, `wait healthy ${next}`];
    if (!results.healthy) {
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`write upstream ${next}`, "reload nginx");
    if (!results.reload) {
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`smoke test ${next}`);
    if (!results.smoke) {
        actions.push(`write upstream ${live}`, "reload nginx", `stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`drain ${live} ${state.drainSeconds ?? 30}s`, `stop ${live}`);
    return { actions, active: next };
}
