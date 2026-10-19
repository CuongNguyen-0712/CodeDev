// Harness: Fix the search controller that renders stale results
// search() returns a promise that stays pending until a step settles it, so the tests
// decide the order in which responses arrive. Like fetch, it rejects with an AbortError
// when its signal is aborted - unless input.ignoresAbort is set (a source that answers anyway).
//   { op: "input", query } | { op: "resolve", call, results } | { op: "reject", call, message } | { op: "dispose" }
// Output: every onResults / onError call, and which search calls were aborted while pending.
async function __harness(input) {
    const calls = [];
    const aborted = [];
    const log = [];
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    function search(query, options) {
        const signal = options && options.signal;
        const index = calls.length;
        return new Promise((resolve, reject) => {
            const call = { pending: true, resolve, reject };
            calls.push(call);
            const finish = (fn) => (value) => {
                if (!call.pending) return;
                call.pending = false;
                fn(value);
            };
            call.resolve = finish(resolve);
            call.reject = finish(reject);
            if (signal) {
                const onAbort = () => {
                    if (!call.pending) return;
                    aborted.push(index);
                    if (!input.ignoresAbort) call.reject(new DOMException("The operation was aborted.", "AbortError"));
                };
                if (signal.aborted) onAbort();
                else signal.addEventListener("abort", onAbort, { once: true });
            }
        });
    }

    const controller = createSearchController({
        search,
        onResults: (query, results) => log.push(`results:${query}:${(results || []).join(",")}`),
        onError: (query, message) => log.push(`error:${query}:${message}`),
    });

    for (const step of input.steps || []) {
        if (step.op === "input") controller.input(step.query);
        else if (step.op === "resolve") calls[step.call]?.resolve(step.results);
        else if (step.op === "reject") calls[step.call]?.reject(new Error(step.message));
        else if (step.op === "dispose") controller.dispose();
        await settle();
    }

    return { log, aborted };
}
