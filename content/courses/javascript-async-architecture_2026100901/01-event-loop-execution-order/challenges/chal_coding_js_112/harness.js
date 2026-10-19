// Harness: a deterministic event loop (tasks, microtask checkpoint, timers on a virtual clock)
// A test describes a program as data; the harness turns it into callbacks that use the loop:
//   { log: "A" }                          -> record "A@<now>"
//   { timeout: ms, id?: "x", do: [...] }  -> loop.setTimeout(() => run the steps, ms)
//   { clear: "x" }                        -> loop.clearTimeout(<id of timer "x">)
//   { micro: [...] }                      -> loop.queueMicrotask(() => run the steps)
//   { throw: "msg" }                      -> throw new Error("msg")
// Errors reported through onError are recorded as "error:<message>@<now>".
// Output: the recorded log, in execution order.
async function __harness(input) {
    const loop = createEventLoop();
    const log = [];
    const timerIds = {};

    function steps(list) {
        return () => {
            for (const step of list || []) {
                if ("log" in step) log.push(`${step.log}@${loop.now()}`);
                else if ("timeout" in step) {
                    const id = loop.setTimeout(steps(step.do), step.timeout);
                    if (step.id) timerIds[step.id] = id;
                } else if ("clear" in step) loop.clearTimeout(timerIds[step.clear]);
                else if ("micro" in step) loop.queueMicrotask(steps(step.micro));
                else if ("throw" in step) throw new Error(step.throw);
            }
        };
    }

    loop.run(steps(input.main), (error) => {
        log.push(`error:${error && error.message}@${loop.now()}`);
    });

    return log;
}
