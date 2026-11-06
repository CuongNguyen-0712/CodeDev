// @piece switch-version: Switch only to a version that has caught up
return this.db.tx((tx) => {
    const current = tx.get<string>("meta", "active") ?? "v1";
    if (version === current) return true;
    for (const [key, offset] of tx.rows<number>("offsets")) {
        if (!key.startsWith(`${current}/`)) continue;
        const target = tx.get<number>("offsets", `${version}/${key.slice(current.length + 1)}`);
        if (target === undefined && offset < 0) return false;
    }
    tx.put("meta", "active", version);
    return true;
});
