// Wrong variant: calls yieldToLoop() but never awaits it -> the loop never gives up the thread.
async function processInChunks(items, chunkSize, fn, yieldToLoop) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    results.push(fn(items[i], i));
    if ((i + 1) % chunkSize === 0) yieldToLoop();
  }
  return results;
}
