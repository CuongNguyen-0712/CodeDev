/**
 * Reference solution (never shipped to learners).
 */
async function processInChunks(items, handle, budgetMs, host) {
  const results = [];
  let sliceStart = host.now();

  for (let i = 0; i < items.length; i++) {
    results.push(handle(items[i]));

    const remaining = items.length - i - 1;
    if (remaining > 0 && host.now() - sliceStart >= budgetMs) {
      await host.yieldToMain();
      sliceStart = host.now();
    }
  }

  return results;
}
