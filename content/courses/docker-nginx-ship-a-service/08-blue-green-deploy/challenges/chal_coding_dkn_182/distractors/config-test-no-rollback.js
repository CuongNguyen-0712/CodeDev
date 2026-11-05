// @piece config-test: Write the upstream file and test it
actions.push(`write upstream ${next}`, "nginx -t");
if (!results.configTest) {
    actions.push(`stop ${next}`);
    return { actions, active: live };
}
