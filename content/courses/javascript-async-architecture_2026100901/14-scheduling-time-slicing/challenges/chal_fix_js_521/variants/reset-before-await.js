// Wrong variant: resets the slice start but still does not await the yield,
// so the loop never actually gives the main thread back.
async function processInChunks(items, handle, budgetMs, host) {
  const results = [];
  let sliceStart = host.now();
  for (let i = 0; i < items.length; i++) {
    results.push(handle(items[i]));
    if (items.length - i - 1 > 0 && host.now() - sliceStart >= budgetMs) {
      host.yieldToMain();
      sliceStart = host.now();
    }
  }
  return results;
}
