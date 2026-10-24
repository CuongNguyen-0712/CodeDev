// Harness: runs the learner's loadProgress(userId, { fetch, cache }) against a fake API.
// input.scenarios: [{ userId, cached, responses }]
//   cached     the value already in the cache for this user (null = empty cache)
//   responses  what the fake fetch answers, in order: { status, body } or { network: true }
//              (a rejected fetch). Extra calls get the last response again.
// Output, one entry per scenario: { result, fetchCalls, cacheAfter } or { threw: true }.
async function __harness(input) {
    const out = [];
    for (const s of input.scenarios) {
        const key = `progress:${s.userId}`;
        const store = new Map(s.cached === null ? [] : [[key, s.cached]]);
        const cache = {
            get: (k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : undefined),
            set: (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); },
        };
        let calls = 0;
        const fetch = async (url) => {
            const r = s.responses[Math.min(calls, s.responses.length - 1)];
            calls++;
            if (url !== `https://api.codedev.test/users/${s.userId}/progress`) {
                return { status: 404, ok: false, json: async () => ({ title: "Not Found" }) };
            }
            if (r.network) throw new TypeError("Failed to fetch");
            return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body ?? null };
        };
        try {
            const result = await loadProgress(s.userId, { fetch, cache });
            out.push({ result, fetchCalls: calls, cacheAfter: store.has(key) ? store.get(key) : null });
        } catch {
            out.push({ threw: true });
        }
    }
    return out;
}
