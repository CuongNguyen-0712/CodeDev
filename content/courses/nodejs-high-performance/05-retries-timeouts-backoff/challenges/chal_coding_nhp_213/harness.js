// Harness: Circuit breaker around the fraud-scoring client
// Replays a timeline against createCircuitBreaker() with a fake clock. The wrapped fn takes a few
// real milliseconds (so concurrent calls overlap) and succeeds or fails as the step says.
// Output:
//   results -> per step: "ok" | "fail" (fn's own error came back) | "open" (CIRCUIT_OPEN, fn not
//              called) | the state string for { op: "state" } | "invalid:<...>"
//   calls   -> how many times fn actually ran;  state -> breaker.state() at the end
async function __harness(input) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let clock = 0;
    let calls = 0;
    const fn = async (spec) => {
        calls++;
        await delay(3);
        if (spec.result === "fail") throw Object.assign(new Error("fraud API 503"), { status: 503, upstream: true });
        return { score: 12 };
    };

    const breaker = createCircuitBreaker(fn, input.options, () => clock);

    const one = async (spec) => {
        try {
            const value = await breaker.call(spec);
            return value && value.score === 12 ? "ok" : `invalid:${JSON.stringify(value)}`;
        } catch (error) {
            if (error && error.upstream) return "fail";
            if (error && error.code === "CIRCUIT_OPEN") return "open";
            return `invalid:${error && error.message}`;
        }
    };

    const results = [];
    for (const step of input.steps || []) {
        if (step.op === "advance") clock += Number(step.ms) || 0;
        else if (step.op === "state") results.push(breaker.state());
        else if (step.op === "call") results.push(await one(step));
        else if (step.op === "concurrent") results.push(await Promise.all((step.calls || []).map(one)));
    }

    await delay(10);
    return { results, calls, state: breaker.state() };
}
