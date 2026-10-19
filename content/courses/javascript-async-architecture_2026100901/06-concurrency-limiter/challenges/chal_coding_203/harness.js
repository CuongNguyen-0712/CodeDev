// Harness: mapWithConcurrency (worker pool)
// Every task runs on a fake clock the harness controls. input.tasks[i]:
//   { ms, value }   -> resolves with value after ms
//   { ms, error }   -> rejects with new Error(error) after ms
//   { throws }      -> task() throws synchronously
// The clock jumps from one finishing task to the next; between two steps every pending promise
// callback runs. The run continues until no task is left, so late starts are visible too.
// Output:
//   { outcome: "resolved", at, value, maxInFlight, startedAt }   (rejected reasons shown as messages)
//   { outcome: "rejected", at, error, maxInFlight, startedAt }
//   startedAt[i] = clock time when task i was started, or null if it never started.
async function __harness(input) {
    let now = 0;
    let seq = 0;
    const queue = new Map();

    const specs = input.tasks || [];
    const startedAt = specs.map(() => null);
    let inFlight = 0;
    let maxInFlight = 0;

    function task(item, index) {
        startedAt[index] = now;
        if (item.throws) throw new Error(item.throws);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve, reject) => {
            const id = ++seq;
            queue.set(id, {
                id,
                at: now + item.ms,
                settle() {
                    inFlight -= 1;
                    if (item.error) reject(new Error(item.error));
                    else resolve(item.value);
                },
            });
        });
    }

    const message = (reason) => (reason && reason.message ? reason.message : String(reason));
    let settled = null;
    let promise;
    try {
        const options = "stopOnError" in input ? { stopOnError: input.stopOnError } : undefined;
        promise = Promise.resolve(mapWithConcurrency(specs, input.limit, task, options));
    } catch (error) {
        promise = Promise.reject(error);
    }
    promise.then(
        (value) => {
            const shown = Array.isArray(value)
                ? value.map((entry) => (entry && entry.status === "rejected" ? { status: "rejected", reason: message(entry.reason) } : entry))
                : value;
            settled = { outcome: "resolved", at: now, value: shown };
        },
        (error) => {
            settled = { outcome: "rejected", at: now, error: message(error) };
        },
    );

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    for (let guard = 0; guard < 500; guard++) {
        let next = null;
        for (const timer of queue.values()) {
            if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        queue.delete(next.id);
        now = next.at;
        next.settle();
        await tick();
    }

    return { ...(settled || { outcome: "still pending", at: now }), maxInFlight, startedAt };
}
