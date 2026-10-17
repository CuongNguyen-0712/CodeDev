// Harness: Fix the time-slicing loop
// Each item costs input.costMs on a fake clock. yieldToMain() resolves only when the
// harness runs the next host task, so a slice = everything handled between two host tasks.
// Output: { slices: items handled per slice, results }
async function __harness(input) {
    let now = 0;
    const hostQueue = [];
    const slices = [[]];

    const host = {
        now: () => now,
        yieldToMain: () => new Promise((resolve) => hostQueue.push(resolve)),
    };

    const handle = (item) => {
        now += input.costMs;
        slices[slices.length - 1].push(item);
        return item * 10;
    };

    let finished = false;
    let results;
    let failure = null;
    processInChunks(input.items.slice(), handle, input.budgetMs, host).then(
        (value) => { results = value; finished = true; },
        (error) => { failure = error; finished = true; },
    );

    // Host event loop: one macrotask per turn; all microtasks settle in between.
    for (let turn = 0; turn < 200; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (hostQueue.length === 0) {
            if (finished) break;
            continue;
        }
        slices.push([]);
        hostQueue.shift()();
    }
    if (failure) throw failure;
    if (!finished) throw new Error("processInChunks never finished");

    return { slices: slices.filter((s) => s.length > 0), results };
}
