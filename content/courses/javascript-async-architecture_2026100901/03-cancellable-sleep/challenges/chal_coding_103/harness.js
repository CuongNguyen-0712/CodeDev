// Harness: cancellable sleep(ms, { signal, timers })
// Fake timers on a virtual clock; microtasks settle between timer callbacks, so a polling loop
// starts its next sleep at the right virtual time. The signal is a real AbortSignal whose
// addEventListener / removeEventListener are wrapped to count "abort" listeners.
//
// input.sleeps:      durations, awaited one after another with the same signal (a polling loop)
// input.abortBefore: abort before the first sleep
// input.abortAt:     abort at this virtual time
// input.reason:      omitted -> controller.abort() (default AbortError); a string -> new Error(reason)
//
// Output: { outcome, timersCreated, pendingTimers, listenersAtEnd?, maxListeners? }
//   pendingTimers: timers still scheduled at the moment the loop ended (resolved or rejected)
//   outcome: one entry per sleep - { resolvedAt } or { rejectedAt, name, message?, isReason }
//   listenersAtEnd / maxListeners are reported only when the signal was never aborted.
async function __harness(input) {
    let now = 0;
    let seq = 0;
    let timersCreated = 0;
    const timers = new Map();

    const fakeTimers = {
        setTimeout(callback, ms) {
            const id = ++seq;
            timersCreated++;
            timers.set(id, { id, at: now + Math.max(0, Number(ms) || 0), callback });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
    };

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    async function advanceTo(target) {
        for (let guard = 0; guard < 1000; guard++) {
            await settle();
            let next = null;
            for (const timer of timers.values()) {
                if (timer.at > target) continue;
                if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
            }
            if (!next) break;
            timers.delete(next.id);
            now = next.at;
            next.callback();
        }
        now = target;
        await settle();
    }

    const controller = new AbortController();
    const { signal } = controller;
    const listeners = new Set();
    let maxListeners = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (type, listener, options) => {
        if (type === "abort") {
            listeners.add(listener);
            maxListeners = Math.max(maxListeners, listeners.size);
        }
        return add(type, listener, options);
    };
    signal.removeEventListener = (type, listener, options) => {
        if (type === "abort") listeners.delete(listener);
        return remove(type, listener, options);
    };

    const abort = () => {
        if (input.reason === undefined) controller.abort();
        else controller.abort(new Error(input.reason));
    };

    if (input.abortBefore) abort();

    const outcome = [];
    let finished = false;
    let listenersAtEnd = null;
    let pendingTimers = null;
    (async () => {
        for (const ms of input.sleeps) {
            try {
                await sleep(ms, { signal, timers: fakeTimers });
                outcome.push({ resolvedAt: now });
            } catch (error) {
                const entry = { rejectedAt: now, name: error && error.name };
                if (entry.name !== "AbortError") entry.message = error && error.message;
                entry.isReason = error === signal.reason;
                outcome.push(entry);
                break;
            }
        }
        pendingTimers = timers.size;
        if (!signal.aborted) listenersAtEnd = listeners.size;
        finished = true;
    })();

    if (typeof input.abortAt === "number") {
        await advanceTo(input.abortAt);
        abort();
    }
    await advanceTo(100000);
    if (!finished) throw new Error("sleep() never settled");

    const result = { outcome, timersCreated, pendingTimers };
    if (!signal.aborted) {
        result.listenersAtEnd = listenersAtEnd;
        result.maxListeners = maxListeners;
    }
    return result;
}
