// Harness: Implement PUT with ETag / If-Match
// An in-memory products table with versioned rows. With input.raceOnUpdate, another
// writer commits (version + 1) right before your first updateIfVersion call runs.
// Output: { status, etag (only for 2xx), bodyVersion (only for 2xx), stored: { price, version } | null }
async function __harness(input) {
    const ticks = async (n) => {
        for (let i = 0; i < n; i++) await null;
    };

    const rows = new Map((input.rows || []).map((r) => [r.id, { ...r }]));
    let raced = false;

    const repo = {
        async findById(id) {
            await ticks(1);
            const row = rows.get(id);
            return row ? { ...row } : null;
        },
        async updateIfVersion(id, version, changes) {
            await ticks(1);
            const before = rows.get(id);
            if (input.raceOnUpdate && !raced && before) {
                raced = true;
                rows.set(id, { ...before, ...input.raceOnUpdate, id, version: before.version + 1 });
            }
            const current = rows.get(id);
            if (!current || String(current.version) !== String(version)) return null;
            const updated = { ...current, ...(changes || {}), id: current.id, version: current.version + 1 };
            rows.set(id, updated);
            return { ...updated };
        },
    };

    const request = input.request || {};
    const res = await updateProductPrice(
        { params: { ...(request.params || {}) }, headers: { ...(request.headers || {}) }, body: { ...(request.body || {}) } },
        repo
    );

    const status = res && typeof res.status === "number" ? res.status : null;
    const ok = status !== null && status >= 200 && status < 300;
    let etag = null;
    if (ok && res.headers) {
        const key = Object.keys(res.headers).find((k) => k.toLowerCase() === "etag");
        etag = key ? String(res.headers[key]) : null;
    }
    const stored = rows.get((request.params || {}).id);

    return {
        status,
        etag,
        bodyVersion: ok && res.body && res.body.version !== undefined ? res.body.version : null,
        stored: stored ? { price: stored.price, version: stored.version } : null,
    };
}
