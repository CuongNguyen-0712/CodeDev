// Wrong variant: `limit` worker loops pull from a shared index. The first error rejects the
// result, but the other workers keep pulling and starting new uploads nobody will look at.
async function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        const value = await task(items[index], index);
        results[index] = stopOnError ? value : { status: "fulfilled", value };
      } catch (reason) {
        if (stopOnError) throw reason;
        results[index] = { status: "rejected", reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  if (stopOnError) {
    // allSettled keeps the surviving workers running after the first one throws.
    const first = await Promise.race(workers.map((w) => w.then(() => null, (e) => ({ e }))));
    if (first) throw first.e;
    const outcomes = await Promise.allSettled(workers);
    const failure = outcomes.find((o) => o.status === "rejected");
    if (failure) throw failure.reason;
  } else {
    await Promise.all(workers);
  }
  return results;
}
