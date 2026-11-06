// @piece installed-entries: Check every installed entry
for (const [key, entry] of Object.entries(packages)) {
    if (!key.includes("node_modules/") || entry.link === true) continue;
    const name = key.replace(/^node_modules\//, "");
    const resolved = entry.resolved;
    if (typeof resolved !== "string" || !policy.allowedRegistries.some((r) => resolved.includes(r))) {
        findings.push({ kind: "registry", package: name, detail: typeof resolved === "string" ? resolved : "no resolved URL" });
    }
    if (typeof entry.integrity !== "string" || entry.integrity === "") {
        findings.push({ kind: "integrity", package: name, detail: "missing" });
    }
}
