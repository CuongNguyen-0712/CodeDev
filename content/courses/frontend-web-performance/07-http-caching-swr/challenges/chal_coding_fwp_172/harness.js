// Harness: plays a timeline of requests through one browser cache per user, one shared CDN cache
// and the origin, using the learner's cachingHeaders(path) for every response.
// Rules (RFC 9111, RFC 5861 stale-while-revalidate, RFC 9213 CDN-Cache-Control):
// - no-store: never stored. private: the browser may store it, the CDN may not.
// - freshness: the browser uses max-age; the CDN uses CDN-Cache-Control max-age when that header
//   exists, else s-maxage, else max-age. No directive = no freshness (this origin sends no
//   Last-Modified, so there is no heuristic freshness).
// - no-cache: stored, but every use is checked with the next hop first (a revalidation).
// - stale-while-revalidate=N: up to N s after going stale the cache answers with the stored copy and
//   refreshes it in the background (here: right after answering).
// - a revalidation whose version is unchanged is a 304; the stored copy is reused.
// - the CDN keys entries by path only (no Vary), as configured for this app.
//
// input:  { requests: [{ t, user, path }], changes: [{ t, path, version }] }
//         the cart path answers "cart-<user>" for each user; other paths start at version "v1"
// output: { responses: [{ t, user, path, from, status, version }], originHits, leaks }
//   from: "browser" | "browser-stale" | "cdn" | "cdn-stale" | "origin"; status: "cache" | 200 | 304
async function __harness(input) {
    const directives = (value) => {
        const out = {};
        for (const part of String(value || "").split(",")) {
            const [k, v] = part.trim().toLowerCase().split("=");
            if (k) out[k] = v === undefined ? true : Number(v);
        }
        return out;
    };
    const policy = (path, layer) => {
        const h = cachingHeaders(path) || {};
        const get = (name) => Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase());
        const cc = directives(get("Cache-Control") && get("Cache-Control")[1]);
        if (layer === "browser") {
            return { store: !cc["no-store"], lifetime: Number(cc["max-age"]) || 0, noCache: Boolean(cc["no-cache"]), swr: Number(cc["stale-while-revalidate"]) || 0 };
        }
        const cdnHeader = get("CDN-Cache-Control");
        const d = cdnHeader ? directives(cdnHeader[1]) : cc;
        const lifetime = cdnHeader ? Number(d["max-age"]) || 0 : Number(d["s-maxage"] ?? d["max-age"]) || 0;
        return { store: !d["no-store"] && !d.private && !cc.private, lifetime, noCache: Boolean(d["no-cache"]), swr: Number(d["stale-while-revalidate"]) || 0 };
    };

    const versions = {};
    const pending = [...(input.changes || [])].sort((a, b) => a.t - b.t);
    let originHits = 0;
    const origin = (path, user) => {
        originHits++;
        return path === "/api/cart" ? `cart-${user}` : versions[path] || "v1";
    };
    const cdn = new Map();
    const browsers = new Map();

    // One hop: answer from `cache` (a Map) or ask `next`; returns { from, version, revalidated }.
    // Only from and version cross a hop: a 304 between the CDN and the origin is invisible to the browser.
    function through(cache, layer, path, t, next, names) {
        const p = policy(path, layer);
        const ask = () => { const n = next(); return { from: n.from, version: n.version }; };
        const e = cache.get(path);
        if (e) {
            const age = t - e.storedAt;
            if (!p.noCache && age < p.lifetime) return { from: names.fresh, version: e.version };
            if (!p.noCache && age < p.lifetime + p.swr) {
                const fresh = ask();
                cache.set(path, { version: fresh.version, storedAt: t });
                return { from: names.stale, version: e.version };
            }
            const fresh = ask();
            if (p.store) cache.set(path, { version: fresh.version, storedAt: t });
            else cache.delete(path);
            return { ...fresh, revalidated: fresh.version === e.version };
        }
        const fresh = ask();
        if (p.store) cache.set(path, { version: fresh.version, storedAt: t });
        return fresh;
    }

    const responses = [];
    let leaks = 0;
    try {
        for (const r of [...input.requests].sort((a, b) => a.t - b.t)) {
            while (pending.length && pending[0].t <= r.t) { const c = pending.shift(); versions[c.path] = c.version; }
            if (!browsers.has(r.user)) browsers.set(r.user, new Map());
            const res = through(browsers.get(r.user), "browser", r.path, r.t, () =>
                through(cdn, "cdn", r.path, r.t, () => ({ from: "origin", version: origin(r.path, r.user) }), { fresh: "cdn", stale: "cdn-stale" }),
            { fresh: "browser", stale: "browser-stale" });
            if (r.path === "/api/cart" && res.version !== `cart-${r.user}`) leaks++;
            responses.push({ t: r.t, user: r.user, path: r.path, from: res.from, status: res.from.startsWith("browser") ? "cache" : res.revalidated ? 304 : 200, version: res.version });
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
    return { responses, originHits, leaks };
}
