/**
 * Reference solution (never shipped to learners).
 * Run one chunk synchronously, then give the event loop a turn before the next one.
 */
async function processInChunks(items, chunkSize, fn, yieldToLoop) {
  const results = new Array(items.length);

  for (let start = 0; start < items.length; start += chunkSize) {
    if (start > 0) await yieldToLoop();

    const end = Math.min(start + chunkSize, items.length);
    for (let i = start; i < end; i++) {
      results[i] = fn(items[i], i);
    }
  }

  return results;
}
