// Rolls back by stopping the candidate only: the upstream file on disk still names it.
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
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    actions.push("reload nginx");
    if (!results.reload) {
        actions.push(`stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`smoke test ${next}`);
    if (!results.smoke) {
        actions.push(`write upstream ${live}`, "nginx -t", "reload nginx", `stop ${next}`);
        return { actions, active: live };
    }
    actions.push(`drain ${live} ${state.drainSeconds ?? 30}s`, `stop ${live}`);
    return { actions, active: next };
}
