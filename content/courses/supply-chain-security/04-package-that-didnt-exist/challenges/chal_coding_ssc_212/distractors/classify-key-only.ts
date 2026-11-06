// @piece classify: Classify every dependency
const trustedScopes = new Set([...policy.ownedScopes, ...policy.knownScopes]);
for (const [key, spec] of Object.entries(dependencies)) {
    const pkg = key;
    if (!isValidName(key) || !isValidName(pkg)) {
        findings.push({ dependency: key, package: "", status: "invalid" });
        continue;
    }
    let status: Status = "ok";
    if (pkg.startsWith("@") && !trustedScopes.has(pkg.slice(0, pkg.indexOf("/")))) status = "unknown_scope";
    else if (!published.has(pkg)) status = "not_found";
    findings.push({ dependency: key, package: pkg, status });
}
