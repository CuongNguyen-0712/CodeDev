// @piece plan-scripts: Plan every script of every package
const plan: Plan = { run: [], blocked: [] };
for (const pkg of lock) {
    const git = isGitDependency(pkg);
    const reason = blockReason(pkg, allowlist);
    for (const script of LIFECYCLE) {
        if (!pkg.scripts[script]) continue;
            const id = `${pkg.name}@${pkg.version}`;
        if (reason === null) plan.run.push({ package: id, script });
        else plan.blocked.push({ package: id, script, reason });
    }
}
