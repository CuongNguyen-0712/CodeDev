// Harness: debounce with leading / trailing / maxWait, cancel() and flush()
// Replays a timeline against a fake clock the harness controls:
//   { call: "value" }  -> debounced("value")
//   { advance: ms }    -> move the clock forward, firing due timers in order
//   { cancel: true }   -> debounced.cancel()
//   { flush: true }    -> debounced.flush()
// After the timeline the clock is advanced far enough for everything to settle.
// Output: every invocation of fn as { at: <clock time>, args: [...] }.
async function __harness(input) {
    let now = 0;
    let seq = 0;
    const timers = new Map();

    const fakeTimers = {
        setTimeout(callback, ms) {
            const id = ++seq;
            const delay = Math.max(0, Number(ms) || 0);
            timers.set(id, { id, at: now + delay, callback });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        now() {
            return now;
        },
    };

    function advance(ms) {
        const target = now + Math.max(0, Number(ms) || 0);
        for (let guard = 0; guard < 10000; guard++) {
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
    }

    const invocations = [];
    const fn = (...args) => {
        invocations.push({ at: now, args });
    };

    const debounced = debounce(fn, input.waitMs, input.options, fakeTimers);

    for (const step of input.timeline || []) {
        if ("call" in step) debounced(step.call);
        else if ("advance" in step) advance(step.advance);
        else if (step.cancel) debounced.cancel();
        else if (step.flush) debounced.flush();
    }
    advance(60000);

    return invocations;
}
