// Harness: Implement a DataLoader-style batch loader
// batchFn is a fake "SELECT ... WHERE id = ANY($1)" that answers after a few microtask
// ticks and records every key list it receives. Each round's load() calls are made in
// one synchronous block; the next round starts after the previous one settled.
// Output: { results: per round, per load -> value | { error }, calls: [keys of each batchFn call] }
async function __harness(input) {
    const ticks = async (n) => {
        for (let i = 0; i < n; i++) await null;
    };

    const data = input.data || {};
    const calls = [];

    const batchFn = async (keys) => {
        calls.push(Array.isArray(keys) ? keys.slice() : keys);
        await ticks(3);
        if (input.failBatchContaining && keys.includes(input.failBatchContaining)) {
            throw new Error(input.batchError || "DB_TIMEOUT");
        }
        return keys.map((key) =>
            Object.prototype.hasOwnProperty.call(data, key) ? data[key] : new Error(`NOT_FOUND:${key}`)
        );
    };

    const options = input.maxBatchSize ? { maxBatchSize: input.maxBatchSize } : {};
    const loader = createBatchLoader(batchFn, options);

    const results = [];
    for (const round of input.rounds || []) {
        const promises = round.map((key) => Promise.resolve(loader.load(key)));
        const settled = await Promise.allSettled(promises);
        results.push(settled.map((s) =>
            s.status === "fulfilled"
                ? (s.value === undefined ? null : s.value)
                : { error: s.reason && s.reason.message ? s.reason.message : String(s.reason) }
        ));
    }

    return { results, calls };
}
