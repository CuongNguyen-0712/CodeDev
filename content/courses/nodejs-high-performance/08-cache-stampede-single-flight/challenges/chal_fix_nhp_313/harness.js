// Harness: Fix the cache that remembers a failure
// A fake FX provider answers "<currency>#<call number>" or rejects with FX_PROVIDER_DOWN
// while it is down. The clock is fake and only moves on "advance" steps.
// Steps:
//   { op: "get", currency }            -> awaits cache.get(currency)
//   { op: "getMany", currency, count } -> `count` concurrent gets, awaited together
//   { op: "advance", ms }              -> moves the clock forward
//   { op: "down" } / { op: "up" }      -> provider starts failing / recovers
// Output: { results: [...value or "error:<message>" per get, in order], fetchCalls }
async function __harness(input) {
    let clock = 0;
    let down = false;
    let fetchCalls = 0;

    const fetchRate = (currency) => {
        fetchCalls++;
        const callNumber = fetchCalls;
        const failing = down;
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (failing) reject(new Error("FX_PROVIDER_DOWN"));
                else resolve(`${currency}#${callNumber}`);
            }, 0);
        });
    };

    const cache = createRateCache(fetchRate, { ttlMs: input.ttlMs, now: () => clock });

    const settle = (promise) => Promise.resolve(promise).then(
        (value) => value,
        (error) => `error:${error && error.message ? error.message : String(error)}`
    );

    const results = [];
    for (const step of input.steps || []) {
        if (step.op === "advance") clock += Number(step.ms) || 0;
        else if (step.op === "down") down = true;
        else if (step.op === "up") down = false;
        else if (step.op === "get") results.push(await settle(cache.get(step.currency)));
        else if (step.op === "getMany") {
            const calls = [];
            for (let i = 0; i < (Number(step.count) || 1); i++) calls.push(settle(cache.get(step.currency)));
            results.push(...(await Promise.all(calls)));
        }
        // Let any clean-up the cache schedules on settle run before the next step.
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return { results, fetchCalls };
}
