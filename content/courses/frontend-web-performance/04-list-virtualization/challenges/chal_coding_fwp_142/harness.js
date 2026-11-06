// Harness: calls the learner's visibleWindow once per scroll position.
// input:  { rows: [{ id, height }] } or { uniform: { count, height } } (ids "dish-<i>"),
//         calls: [{ scrollTop, height, overscan? }]
// output: one { start, end, offsetTop, totalHeight, keys } per call, or { error }.
async function __harness(input) {
    const rows = input.rows
        ? input.rows.map((r) => ({ ...r }))
        : Array.from({ length: input.uniform.count }, (_, i) => ({ id: `dish-${i}`, height: input.uniform.height }));
    try {
        return input.calls.map((c) => {
            const options = c.overscan === undefined ? {} : { overscan: c.overscan };
            const r = visibleWindow(rows, { scrollTop: c.scrollTop, height: c.height }, options);
            return r ? { start: r.start, end: r.end, offsetTop: r.offsetTop, totalHeight: r.totalHeight, keys: r.keys } : null;
        });
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
