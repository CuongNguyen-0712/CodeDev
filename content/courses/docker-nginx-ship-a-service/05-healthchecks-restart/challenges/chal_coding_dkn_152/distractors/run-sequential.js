// @piece run-in-parallel: Run both checks at the same time
const results = [];
for (const name of names) {
    try {
        results.push({ status: "fulfilled", value: await deps[name].ping() });
    } catch (err) {
        results.push({ status: "rejected", reason: err });
    }
}
