// Wrong variant: yields for real now, but the slice start is never reset,
// so after the first yield it yields after every single item.
async function processInChunks(items, handle, budgetMs, host) {
  const results = [];
  const sliceStart = host.now();
  for (let i = 0; i < items.length; i++) {
    results.push(handle(items[i]));
    if (items.length - i - 1 > 0 && host.now() - sliceStart >= budgetMs) {
      await host.yieldToMain();
    }
  }
  return results;
}
