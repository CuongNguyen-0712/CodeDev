// Harness: Fix the client loader that connects three times
// connect() returns a promise that stays pending until a step settles it, so the
// tests control exactly which getClient() calls overlap with which connection attempt.
//   { op: "call" }                          -> getClient()
//   { op: "resolve", connect: i, value }    -> the i-th connect() call resolves with value
//   { op: "reject", connect: i, message }   -> the i-th connect() call rejects with new Error(message)
// Output: how many times connect() was called, and how every getClient() call ended.
async function __harness(input) {
    const connects = [];
    const connect = () => new Promise((resolve, reject) => { connects.push({ resolve, reject }); });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    const getClient = createClientLoader(connect);
    const results = [];

    for (const step of input.steps || []) {
        if (step.op === "call") {
            const slot = { pending: true };
            results.push(slot);
            Promise.resolve()
                .then(() => getClient())
                .then(
                    (value) => { delete slot.pending; slot.ok = true; slot.value = value; },
                    (error) => {
                        delete slot.pending;
                        slot.ok = false;
                        slot.message = error && error.message;
                        slot.cause = error && error.cause ? error.cause.message ?? String(error.cause) : null;
                    },
                );
        } else if (step.op === "resolve") {
            connects[step.connect]?.resolve(step.value);
        } else if (step.op === "reject") {
            connects[step.connect]?.reject(new Error(step.message));
        }
        await settle();
    }

    return { connectCalls: connects.length, results };
}
