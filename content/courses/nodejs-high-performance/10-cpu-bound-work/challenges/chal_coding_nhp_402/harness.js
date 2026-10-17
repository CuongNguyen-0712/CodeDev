// Harness: Chunk CPU-heavy work so the event loop can breathe
// Scores a batch with a synchronous fn while simulated HTTP requests arrive. A waiting
// request is only served when a yield really completes (the yieldToLoop() promise
// resolves on a later macrotask). Output:
//   results      - what processInChunks resolved with
//   longestRun   - the most fn calls made back-to-back without a completed yield
//   requestWaits - per request (arrival order): items scored between its arrival
//                  ("after N items") and the moment it was served
async function __harness(input) {
    const items = Array.isArray(input.items) ? input.items : [];
    const requests = (input.requestsAt || []).map((at) => ({ at, servedAt: null }));

    let processed = 0;
    let run = 0;
    let longestRun = 0;

    const serveWaiting = () => {
        for (const request of requests) {
            if (request.servedAt === null && request.at <= processed) request.servedAt = processed;
        }
    };

    // Deterministic "risk score" that depends on both the item and its index.
    const fn = (amount, index) => {
        processed++;
        run++;
        if (run > longestRun) longestRun = run;
        return (amount * 7 + index * 3) % 100;
    };

    const yieldToLoop = () => new Promise((resolve) => {
        setTimeout(() => {
            run = 0;
            serveWaiting();
            resolve();
        }, 0);
    });

    const results = await processInChunks(items.slice(), input.chunkSize, fn, yieldToLoop);

    // The batch is done: everything still waiting is served now.
    serveWaiting();
    for (const request of requests) {
        if (request.servedAt === null) request.servedAt = processed;
    }

    return {
        results: Array.isArray(results) ? results : null,
        longestRun,
        requestWaits: requests.map((r) => r.servedAt - r.at),
    };
}
