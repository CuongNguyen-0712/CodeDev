// Harness: Implement single-flight request coalescing
// The loader is fake and fully controlled by the test: each loader call stays pending
// until a "resolve"/"reject" step settles every pending call for that key.
// Steps:
//   { op: "call", key, times }        -> calls load(key) `times` times without awaiting
//   { op: "resolve", key, value }     -> resolves all pending loader calls for key
//   { op: "reject", key, message }    -> rejects all pending loader calls for key
// Output: { loaderCalls: { [key]: n }, results: [...] } where results lists every
// load() call in call order: the resolved value, "error:<message>", or "pending".
async function __harness(input) {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    const loaderCalls = {};
    const pending = {};
    const loader = (key) => {
        loaderCalls[key] = (loaderCalls[key] || 0) + 1;
        return new Promise((resolve, reject) => {
            (pending[key] = pending[key] || []).push({ resolve, reject });
        });
    };

    const load = singleFlight(loader);
    if (typeof load !== "function") throw new Error("singleFlight(fn) must return a function");

    const results = [];
    for (const step of input.steps || []) {
        if (step.op === "call") {
            for (let i = 0; i < (Number(step.times) || 1); i++) {
                const index = results.push("pending") - 1;
                Promise.resolve()
                    .then(() => load(step.key))
                    .then(
                        (value) => { results[index] = value; },
                        (error) => { results[index] = `error:${error && error.message ? error.message : String(error)}`; }
                    );
            }
            await flush();
        } else if (step.op === "resolve" || step.op === "reject") {
            const waiting = pending[step.key] || [];
            pending[step.key] = [];
            for (const deferred of waiting) {
                if (step.op === "resolve") deferred.resolve(step.value);
                else deferred.reject(new Error(step.message));
            }
            await flush();
        }
    }

    await flush();
    return { loaderCalls, results };
}
