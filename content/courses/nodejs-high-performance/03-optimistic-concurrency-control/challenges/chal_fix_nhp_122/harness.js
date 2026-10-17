// Harness: Fix the optimistic retry loop
// An in-memory versioned store whose get/compareAndSet take a few microtask ticks
// (like database round-trips). All orders run concurrently against one product row.
// With input.hotRow, another writer always commits just before each of your writes.
// Output: { succeeded, errors (sorted), final, version } (+ casCalls with hotRow).
async function __harness(input) {
    const ticks = async (n) => {
        for (let i = 0; i < n; i++) await null;
    };

    let row = { id: "sku-42", version: 1, data: { sku: "sku-42", ...(input.initial || {}) } };
    let casCalls = 0;

    const store = {
        async get(id) {
            await ticks(2);
            if (id !== row.id) return null;
            return { id: row.id, version: row.version, data: { ...row.data } };
        },
        async compareAndSet(id, expectedVersion, data) {
            await ticks(2);
            casCalls++;
            if (casCalls > 200) throw new Error("RUNAWAY_RETRIES");
            if (id !== row.id) return false;
            if (input.hotRow) {
                // Someone else's write lands first, every single time.
                row = { ...row, version: row.version + 1, data: { ...row.data } };
            }
            if (row.version !== expectedVersion) return false;
            row = { id: row.id, version: row.version + 1, data: { ...data } };
            return true;
        },
    };

    const reserve = (qty) => (data) => {
        if (data.stock < qty) throw new Error("OUT_OF_STOCK");
        return { ...data, stock: data.stock - qty };
    };

    const outcomes = await Promise.all(
        (input.orders || []).map((qty) =>
            Promise.resolve()
                .then(() => updateWithRetry(store, "sku-42", reserve(qty), input.maxAttempts))
                .then(
                    () => null,
                    (error) => (error && error.message ? error.message : String(error))
                )
        )
    );

    const errors = outcomes.filter((o) => o !== null).sort();
    const output = {
        succeeded: outcomes.filter((o) => o === null).length,
        errors,
        final: row.data,
        version: row.version,
    };
    if (input.hotRow) output.casCalls = casCalls;
    return output;
}
