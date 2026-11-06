// @piece collect-walk: Walk every component, keep the first key + version
for (const c of list) {
    const k = componentKey(c);
    if (!k) {
        bad = true;
        return;
    }
    const version = typeof c.version === "string" && c.version !== "" ? c.version : k.purlVersion;
    let versions = entries.get(k.key);
    if (!versions) entries.set(k.key, (versions = new Map()));
    if (versions.has(version)) duplicates++;
    {
        const hashes = new Map<string, string>();
        for (const h of c.hashes ?? []) if (!hashes.has(h.alg)) hashes.set(h.alg, h.content.toLowerCase());
        versions.set(version, { key: k.key, version, fromPurl: k.fromPurl, licenses: licenseList(c), hashes });
    }
    if (Array.isArray(c.components)) walk(c.components);
    if (bad) return;
}
