// Harness: a fake event loop (ms clock) for the search box.
// - typing: [{ at, text }] -> onInput(text) at that time (text is the whole box value).
// - env.setTimeout / clearTimeout run on the fake clock.
// - env.fetch(query, { signal }) answers after latency[query] (default 200) with
//   ["<query> 1", "<query> 2"]. When honorsAbort is true, aborting the signal rejects at once with
//   an error named "AbortError" and the answer never comes; otherwise the signal is ignored (an
//   old search SDK).
// input:  { waitMs, typing, latency, honorsAbort }
// output: { requests: [queries sent], shown: [results passed to show, in order], maxInFlight }
async function __harness(input) {
    let clock = 0;
    let seq = 0;
    const events = []; // { at, seq, run }
    const cancelled = new Set();
    const schedule = (at, run) => {
        const id = ++seq;
        events.push({ at, seq: id, run });
        return id;
    };
    const requests = [];
    const shown = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const env = {
        setTimeout: (fn, ms) => schedule(clock + ms, fn),
        clearTimeout: (id) => { if (id !== null && id !== undefined) cancelled.add(id); },
        fetch(query, options = {}) {
            requests.push(query);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise((resolve, reject) => {
                let done = false;
                const finish = () => { if (!done) { done = true; inFlight--; return true; } return false; };
                const answer = schedule(clock + ((input.latency || {})[query] ?? 200), () => {
                    if (finish()) resolve([`${query} 1`, `${query} 2`]);
                });
                const signal = options.signal;
                if (input.honorsAbort && signal) {
                    signal.addEventListener("abort", () => {
                        cancelled.add(answer);
                        if (finish()) {
                            const error = new Error("The operation was aborted.");
                            error.name = "AbortError";
                            reject(error);
                        }
                    });
                }
            });
        },
        show(results) { shown.push([...results]); },
    };
    let onInput;
    try {
        onInput = createSearchBox(env, input.waitMs);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
    for (const key of input.typing) schedule(key.at, () => onInput(key.text));
    const settle = async () => { for (let i = 0; i < 10; i++) await null; };
    try {
        while (events.length) {
            events.sort((a, b) => a.at - b.at || a.seq - b.seq);
            const event = events.shift();
            if (cancelled.has(event.seq)) continue;
            clock = event.at;
            event.run();
            await settle();
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), requests, shown };
    }
    return { requests, shown, maxInFlight };
}
