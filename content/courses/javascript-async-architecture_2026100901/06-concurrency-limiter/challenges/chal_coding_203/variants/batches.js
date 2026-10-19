// Wrong variant: fixed batches. Never more than `limit` in flight - but each batch waits for
// its slowest task, so free slots sit idle and the whole run takes much longer.
async function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;
  const results = [];
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit).map((item, i) => new Promise((res) => res(task(item, start + i))));
    if (stopOnError) results.push(...(await Promise.all(batch)));
    else results.push(...(await Promise.allSettled(batch)));
  }
  return results;
}
