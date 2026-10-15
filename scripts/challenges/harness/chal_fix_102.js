// Harness: Fix UI Freeze in Heavy Task Processing
// processItems(items, processFn) must process every item and yield to the event
// loop (macrotask) while working through large inputs instead of blocking.
async function __harness(input) {
    const count = Number(input && input.itemsCount) || 0;
    const items = Array.from({ length: count }, (_, i) => i);

    let processed = 0;
    let yielded = false;
    const probe = setTimeout(() => { yielded = true; }, 0);

    const result = processItems(items, () => { processed += 1; });
    const isAsync = Boolean(result && typeof result.then === "function");
    await result;
    clearTimeout(probe);

    const needsYield = count > 500;
    const completed = processed === count && (count === 0 || (isAsync && (!needsYield || yielded)));

    return { completed };
}
