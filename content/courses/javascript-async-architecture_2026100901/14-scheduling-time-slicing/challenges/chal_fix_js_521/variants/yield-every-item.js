// Wrong variant: ignores the budget and yields after every item - responsive,
// but each yield costs a task (and ~4 ms once setTimeout clamps), so the job takes far longer.
async function processInChunks(items, handle, budgetMs, host) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    results.push(handle(items[i]));
    if (i < items.length - 1) await host.yieldToMain();
  }
  return results;
}
