// Harness: Build a fake clock for deterministic timer tests
// Runs a script of timer operations against the learner's fake clock. Every callback
// logs "<name>@<now()>"; tick/runAll log what they report. Output: the log array.
//   { op: "timeout", name, ms, then?: [steps run inside the callback] }
//   { op: "interval", name, ms, stopAfter?: n }   (clears itself after n calls)
//   { op: "clear", name, kind?: "interval" }
//   { op: "tick", ms }                            -> logs "now=<t>"
//   { op: "runAll", limit? }                      -> logs "ran <n>" or "runAll threw", then "now=<t>"
async function __harness(input) {
    const clock = createFakeClock();
    const log = [];
    const ids = {};
    const calls = {};

    function run(step) {
        if (step.op === "timeout") {
            ids[step.name] = clock.setTimeout(() => {
                log.push(`${step.name}@${clock.now()}`);
                (step.then || []).forEach(run);
            }, step.ms);
        } else if (step.op === "interval") {
            calls[step.name] = 0;
            ids[step.name] = clock.setInterval(() => {
                calls[step.name] += 1;
                log.push(`${step.name}@${clock.now()}`);
                if (step.stopAfter && calls[step.name] >= step.stopAfter) clock.clearInterval(ids[step.name]);
            }, step.ms);
        } else if (step.op === "clear") {
            if (step.kind === "interval") clock.clearInterval(ids[step.name]);
            else clock.clearTimeout(ids[step.name]);
        } else if (step.op === "tick") {
            clock.tick(step.ms);
            log.push(`now=${clock.now()}`);
        } else if (step.op === "runAll") {
            try {
                const fired = step.limit === undefined ? clock.runAll() : clock.runAll(step.limit);
                log.push(`ran ${fired}`);
            } catch (error) {
                log.push("runAll threw");
            }
            log.push(`now=${clock.now()}`);
        }
    }

    (input.steps || []).forEach(run);
    return log;
}
