// Harness: Fix the chunked log audit
// The harness plays the host. yieldToMain() resolves only when the harness runs the next host
// task; between host tasks every microtask settles. The user is typing during the audit: each
// keystroke is a host task that queues the next one, up to input.keystrokes.
// Entries come from input.entries, or are generated from input.generate = { count }.
// Output: { timeline, summary } where timeline records progress calls, keystrokes and "done"
// in the order they happened.
async function __harness(input) {
    const hostQueue = [];
    const timeline = [];

    const entries = input.entries
        ? input.entries.map(([level, durationMs]) => ({ level, durationMs }))
        : Array.from({ length: input.generate.count }, (_, i) => ({
            level: i % 7 === 3 ? "error" : i % 4 === 1 ? "warn" : "info",
            durationMs: (i * 37) % 501,
        }));

    let keystrokes = input.keystrokes || 0;
    const keystroke = () => {
        timeline.push("key");
        keystrokes--;
        if (keystrokes > 0) hostQueue.push(keystroke);
    };
    if (keystrokes > 0) hostQueue.push(keystroke);

    let finished = false;
    let summary;
    let failure = null;
    auditLogs(entries, {
        chunkSize: input.chunkSize,
        yieldToMain: () => new Promise((resolve) => hostQueue.push(resolve)),
        onProgress: (processed, total) => timeline.push(`progress ${processed}/${total}`),
    }).then(
        (value) => { summary = value; finished = true; timeline.push("done"); },
        (error) => { failure = error; finished = true; },
    );

    // Host event loop: one task per turn; all microtasks settle in between.
    for (let turn = 0; turn < 300; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (hostQueue.length === 0) {
            if (finished) break;
            continue;
        }
        hostQueue.shift()();
    }
    if (failure) throw failure;
    if (!finished) throw new Error("auditLogs never finished");

    return { timeline, summary };
}
