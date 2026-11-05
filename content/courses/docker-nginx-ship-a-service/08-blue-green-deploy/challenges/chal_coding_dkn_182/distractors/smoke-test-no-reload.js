// @piece smoke-test: Smoke test through nginx, switch back on failure
actions.push(`smoke test ${next}`);
if (!results.smoke) {
    actions.push(`write upstream ${live}`, `stop ${next}`);
    return { actions, active: live };
}
