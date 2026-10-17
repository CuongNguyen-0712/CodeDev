// Wrong variant: yields after index chunkSize, 2*chunkSize... -> the first chunk has chunkSize + 1 items.
async function processInChunks(items, chunkSize, fn, yieldToLoop) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    results.push(fn(items[i], i));
    if (i > 0 && i % chunkSize === 0) await yieldToLoop();
  }
  return results;
}
