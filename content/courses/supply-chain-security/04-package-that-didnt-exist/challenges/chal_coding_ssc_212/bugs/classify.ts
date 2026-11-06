// @piece classify: Classify every dependency
for (const [name, spec] of Object.entries(dependencies)) {
    // Our own scopes are published by the UI team: trust them.
    if (policy.ownedScopes.some((scope) => name.startsWith(scope))) continue;
    // Not a plain package name (workspace links, odd keys): nothing to look up.
    if (!NAME.test(name)) continue;
    findings.push({ dependency: name, package: name, status: published.has(name) ? "ok" : "not_found" });
}
