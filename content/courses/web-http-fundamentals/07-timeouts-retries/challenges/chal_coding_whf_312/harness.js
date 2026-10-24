// Harness: runs the learner's fetchWithRetry against a scripted fake fetch and a fake sleep.
// No network and no timers: sleep only records the delay it was asked for.
// input.scenarios is a list of { outcomes, options }. Each outcome answers one fetch call, in order
// (the last one repeats if fetch is called more often):
//   { status, retryAfter? }  fetch resolves with a Response of that status (+ a Retry-After header)
//   { error: "network" }     fetch rejects with TypeError("Failed to fetch")
//   { error: "timeout" }     fetch rejects with a DOMException named TimeoutError (AbortSignal.timeout)
//   { error: "abort" }       fetch rejects with a DOMException named AbortError (the user cancelled)
// options ({ retries, baseDelayMs }) are passed next to fetch and sleep.
// Output, one entry per scenario: { attempts, delays, outcome } where outcome is "response <status>"
// or "threw <name>: <message>".
async function __harness(input) {
    const results = [];
    for (const scenario of input.scenarios) {
        const outcomes = scenario.outcomes;
        const request = "https://api.codedev.test/courses/42/progress";
        const delays = [];
        let attempts = 0;
        let sleeping = 0;
        let problem = null;

        const fakeFetch = (req) => {
            if (sleeping > 0) problem = "fetch called before sleep finished (await the sleep)";
            if (req !== request) problem = "fetch was not called with the request";
            const outcome = outcomes[Math.min(attempts, outcomes.length - 1)];
            attempts++;
            if (outcome.error === "network") return Promise.reject(new TypeError("Failed to fetch"));
            if (outcome.error === "timeout") return Promise.reject(new DOMException("signal timed out", "TimeoutError"));
            if (outcome.error === "abort") return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
            const headers = outcome.retryAfter === undefined ? {} : { "Retry-After": outcome.retryAfter };
            return Promise.resolve(new Response(null, { status: outcome.status, headers }));
        };
        const fakeSleep = (ms) => {
            delays.push(ms);
            sleeping++;
            return Promise.resolve().then(() => { sleeping--; });
        };

        let outcome;
        try {
            const response = await fetchWithRetry(request, { fetch: fakeFetch, sleep: fakeSleep, ...(scenario.options || {}) });
            outcome = response && typeof response.status === "number" ? "response " + response.status : "returned " + String(response);
        } catch (error) {
            outcome = "threw " + (error && error.name) + ": " + (error && error.message);
        }
        results.push({ attempts, delays, outcome: problem || outcome });
    }
    return results;
}
