/**
 * Applies `handle` to every item without blocking the main thread for longer than `budgetMs`:
 * after each item, if the current slice has used up its budget and items remain, yield to the
 * host so input events and rendering can run, then continue in a fresh slice.
 *
 * BUG: the analytics dashboard still freezes while 5,000 rows are processed, and when it does
 * yield, it yields far too often. Fix the slicing - the results themselves are correct.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => R} handle        synchronous work for one item
 * @param {number} budgetMs              maximum length of one slice
 * @param {{ now(): number, yieldToMain(): Promise<void> }} host
 *        now() is the current time in ms; yieldToMain() resolves in a later task
 *        (scheduler.yield() / setTimeout(0) / MessageChannel in a real browser)
 * @returns {Promise<R[]>}
 */
async function processInChunks(items, handle, budgetMs, host) {
  const results = [];
  const sliceStart = host.now();

  for (let i = 0; i < items.length; i++) {
    results.push(handle(items[i]));

    const remaining = items.length - i - 1;
    if (remaining > 0 && host.now() - sliceStart >= budgetMs) {
      host.yieldToMain();
    }
  }

  return results;
}
