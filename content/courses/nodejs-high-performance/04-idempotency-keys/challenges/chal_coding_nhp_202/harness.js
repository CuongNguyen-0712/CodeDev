// Harness: Idempotency-Key store for POST /payments
// Runs a script of payment requests against createIdempotencyStore() with a fake clock.
// The charge function counts how often it really runs and takes a few ms, so duplicates
// fired together genuinely overlap. Output:
//   results -> one entry per request: "executed:<chargeId>" | "replayed:<chargeId>" |
//              409 | 422 | "error" (the charge itself failed) | "invalid:<what came back>"
//   charges -> how many times the charge function was invoked
async function __harness(input) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let clock = 0;
    const store = createIdempotencyStore({ ttlMs: Number(input.ttlMs) || 60000, now: () => clock });

    let invocations = 0;
    const makeCharge = (request) => async () => {
        const id = `ch_${++invocations}`;
        await delay(5);
        if (request.fail) throw Object.assign(new Error("PROVIDER_DOWN"), { status: 502, provider: true });
        return { chargeId: id, amount: request.amount || 0 };
    };

    const describe = async (request) => {
        try {
            const out = await store.handle(request.key, request.fp, makeCharge(request));
            if (!out || typeof out !== "object" || !out.result || typeof out.result.chargeId !== "string") {
                return `invalid:${JSON.stringify(out)}`;
            }
            if (out.replayed === true) return `replayed:${out.result.chargeId}`;
            if (out.replayed === false) return `executed:${out.result.chargeId}`;
            return `invalid:${JSON.stringify(out)}`;
        } catch (error) {
            if (error && error.provider) return "error";
            if (error && (error.status === 409 || error.status === 422)) return error.status;
            return `invalid:${error && error.message}`;
        }
    };

    const results = [];
    for (const step of input.steps || []) {
        if (step.op === "advance") {
            clock += Number(step.ms) || 0;
        } else if (step.op === "call") {
            results.push(await describe(step));
        } else if (step.op === "concurrent") {
            results.push(await Promise.all((step.calls || []).map(describe)));
        }
    }

    // Let anything the solution forgot to await settle.
    await delay(20);
    return { results, charges: invocations };
}
