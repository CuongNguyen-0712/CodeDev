// Harness: Bounded async queue
// Runs a script of producer/consumer steps against createAsyncQueue({ capacity }).
// After every step it lets all pending promise callbacks run (a few macrotask turns),
// then logs what settled during that step, in the order the operations were issued.
// Log entries:
//   "push a"   push("a") was called        -> later "push a -> ok" or "push a -> rejected QUEUE_CLOSED"
//   "pull#1"   the first pull() was called -> later "pull#1 -> a" or "pull#1 -> done"
//   "close"    close() was called
//   "iterate"  a for await consumer started; it logs "iter a" per item and "iter end" when its loop ends
// At the end, operations that never settled are logged as "<op> -> pending".
async function __harness(input) {
    const queue = createAsyncQueue({ capacity: input.capacity });
    const log = [];
    const ops = [];
    let iterEvents = [];
    let iterState = null;
    let pulls = 0;

    const settle = async () => {
        for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const call = (fn) => {
        try {
            return Promise.resolve(fn());
        } catch (error) {
            return Promise.reject(error);
        }
    };
    const track = (label, promise, format) => {
        const op = { label, settled: false, logged: false, text: "" };
        ops.push(op);
        promise.then(
            (value) => { op.settled = true; op.text = format(value); },
            (error) => { op.settled = true; op.text = "rejected " + (error && error.message ? error.message : String(error)); },
        );
    };
    const formatPull = (result) => {
        if (result && result.done === true) return "done";
        if (result && result.done === false) return String(result.value);
        return "invalid " + JSON.stringify(result);
    };

    for (const step of input.steps || []) {
        if (step.op === "push") {
            const label = "push " + step.value;
            log.push(label);
            track(label, call(() => queue.push(step.value)), () => "ok");
        } else if (step.op === "pull") {
            pulls += 1;
            const label = "pull#" + pulls;
            log.push(label);
            track(label, call(() => queue.pull()), formatPull);
        } else if (step.op === "close") {
            log.push("close");
            try { queue.close(); } catch (error) { log.push("close threw " + error.message); }
        } else if (step.op === "iterate") {
            log.push("iterate");
            iterState = "running";
            (async () => {
                try {
                    for await (const item of queue) iterEvents.push("iter " + item);
                    iterEvents.push("iter end");
                } catch (error) {
                    iterEvents.push("iter error " + (error && error.message ? error.message : String(error)));
                } finally {
                    iterState = "finished";
                }
            })();
        }

        await settle();

        for (const op of ops) {
            if (op.settled && !op.logged) {
                op.logged = true;
                log.push(op.label + " -> " + op.text);
            }
        }
        log.push(...iterEvents);
        iterEvents = [];
    }

    for (const op of ops) {
        if (!op.settled) log.push(op.label + " -> pending");
    }
    if (iterState === "running") log.push("iterate -> pending");

    return log;
}
