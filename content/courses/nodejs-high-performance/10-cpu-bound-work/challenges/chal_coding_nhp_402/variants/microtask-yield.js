// Wrong variant: "yields" with await Promise.resolve() - a microtask runs before any I/O,
// so waiting requests still cannot get in until the whole batch is done.
async function processInChunks(items, chunkSize, fn, yieldToLoop) {
  const results = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    if (start > 0) await Promise.resolve();
    for (let i = start; i < Math.min(start + chunkSize, items.length); i++) {
      results.push(fn(items[i], i));
    }
  }
  return results;
}
