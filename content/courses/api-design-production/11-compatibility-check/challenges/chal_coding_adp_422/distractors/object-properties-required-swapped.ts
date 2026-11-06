// @piece object-properties: Compare properties and required, then go deeper
if (restA.includes("object")) {
    const pa = a.properties ?? {};
    const pb = b.properties ?? {};
    const namesA = new Set(Object.keys(pa));
    const namesB = new Set(Object.keys(pb));
    const ra = new Set(a.required ?? []);
    const rb = new Set(b.required ?? []);
    for (const name of Object.keys(pa)) {
        const p = `${path}/properties/${escapeToken(name)}`;
        if (!namesB.has(name)) {
            breaking.push({ path: p, change: "property-removed" });
            continue;
        }
        if (ra.has(name) && !rb.has(name)) safe.push({ path: p, change: "became-optional" });
        if (!ra.has(name) && rb.has(name)) breaking.push({ path: p, change: "became-required" });
        walk(pa[name], pb[name], p);
    }
    for (const name of Object.keys(pb)) {
        if (!namesA.has(name)) safe.push({ path: `${path}/properties/${escapeToken(name)}`, change: "property-added" });
    }
}
