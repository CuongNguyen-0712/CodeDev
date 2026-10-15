// Harness: Build a Cancellable Sleep Utility
// sleep(ms, { signal }) must resolve after `ms` and reject with an abort error
// as soon as the signal aborts (immediately if it is already aborted).
async function __harness(input) {
    const ms = Number(input && input.ms) || 0;
    const controller = new AbortController();

    if (input && input.abortAtMs === 0) {
        controller.abort();
    } else if (input && typeof input.abortAtMs === "number") {
        setTimeout(() => controller.abort(), input.abortAtMs);
    }

    const started = Date.now();

    try {
        await sleep(ms, { signal: controller.signal });

        // Timers may fire a few ms early; anything earlier means no real wait.
        if (Date.now() - started + 5 < ms) {
            return { error: "Resolved before the delay elapsed" };
        }
        return { resolved: true };
    } catch (error) {
        const isAbort = error && (error.name === "AbortError" || /abort/i.test(String(error.message || error)));
        return { error: isAbort ? "Aborted" : String((error && error.message) || error) };
    }
}
