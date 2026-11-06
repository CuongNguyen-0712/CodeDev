// Harness: a simulated main thread with a fake clock (ms).
// - env.price(item) runs on the main thread: the clock moves by item.costMs.
// - env.yield() ends the current task. Taps that arrived meanwhile run first, in order: each waits
//   (input delay = start - arrival) and its handler takes handlerMs. A tap with { abort: true } is
//   "apply another promo code": it aborts env.signal. Then the recalculation continues.
//   Like scheduler.yield(), the continuation runs from a resolved promise, so a yield that is not
//   awaited lets the loop keep running in the same task.
// - Taps still pending when recalcCart returns run after it.
// input:  { items, promo, budgetMs, taps: [{ at, handlerMs, abort? }], limits: { longTaskMs, inputDelayMs, maxYields } }
// output: { result, rendered, longTasksOk, inputsOk, yieldsOk } or { error, ... }
async function __harness(input) {
    let clock = 0;
    let taskStart = 0;
    let longest = 0;
    let maxDelay = 0;
    let yields = 0;
    const rendered = [];
    const pending = input.taps.map((t) => ({ ...t }));
    const controller = new AbortController();
    const runTap = (tap) => {
        const start = Math.max(clock, tap.at);
        maxDelay = Math.max(maxDelay, start - tap.at);
        clock = start + tap.handlerMs;
        if (tap.abort) controller.abort();
    };
    const env = {
        now: () => clock,
        budgetMs: input.budgetMs,
        signal: controller.signal,
        price(item) {
            clock += item.costMs;
            return item.price * item.qty;
        },
        async yield() {
            await null;
            yields++;
            longest = Math.max(longest, clock - taskStart);
            while (pending.length && pending[0].at <= clock) runTap(pending.shift());
            taskStart = clock;
        },
        render(totals) {
            rendered.push({ ...totals });
        },
    };
    const items = input.items.map((item) => ({ ...item }));
    let result;
    try {
        result = await recalcCart(items, input.promo ? { ...input.promo } : null, env);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), rendered };
    }
    // Let un-awaited yields run before the books are closed, as the event loop would.
    for (let i = 0; i < 5; i++) await null;
    longest = Math.max(longest, clock - taskStart);
    while (pending.length) runTap(pending.shift());
    return {
        result: result === undefined ? null : result,
        rendered,
        longTasksOk: longest <= input.limits.longTaskMs,
        inputsOk: maxDelay <= input.limits.inputDelayMs,
        yieldsOk: yields <= input.limits.maxYields,
    };
}
