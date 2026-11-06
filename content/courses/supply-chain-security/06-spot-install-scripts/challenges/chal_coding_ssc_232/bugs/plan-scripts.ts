// @piece plan-scripts: Plan every script of every package
const reviewed = new Set(allowlist.map((entry) => entry.name));
const plan: Plan = { run: [], blocked: [] };
for (const pkg of lock) {
    for (const script of INSTALL_SCRIPTS) {
        if (!pkg.scripts[script]) continue;
        const id = `${pkg.name}@${pkg.version}`;
        if (reviewed.has(pkg.name) || ALLOW_SCRIPTS_BY_DEFAULT) plan.run.push({ package: id, script });
        else plan.blocked.push({ package: id, script, reason: "not_allowlisted" });
    }
}
