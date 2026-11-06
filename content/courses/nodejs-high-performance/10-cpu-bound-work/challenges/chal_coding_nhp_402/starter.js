/**
 * Scores a batch of transactions without freezing the server.
 *
 * `fn(item, index)` is SYNCHRONOUS CPU work (a fraud-risk score). Calling it for every
 * item in one go blocks the event loop, so no other HTTP request is served until the
 * whole batch is done.
 *
 * Requirements:
 *   - call fn(items[i], i) exactly once per item, in order, and resolve with the array
 *     of results (results[i] is the return value for items[i])
 *   - process the items in chunks of exactly `chunkSize` items (the last chunk may be
 *     shorter) and `await yieldToLoop()` between two chunks, so waiting requests can run
 *   - never call fn more than `chunkSize` times in a row without a completed yield
 *   - an empty `items` array resolves with []
 *
 * `yieldToLoop()` returns a promise that resolves on a later turn of the event loop
 * (in Node.js: `() => new Promise((resolve) => setImmediate(resolve))`).
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} chunkSize  positive integer
 * @param {(item: T, index: number) => R} fn
 * @param {() => Promise<void>} yieldToLoop
 * @returns {Promise<R[]>}
 */
async function processInChunks(items, chunkSize, fn, yieldToLoop) {
  // [ ] Room for one result per item

  for (let start = 0; start < items.length; start += chunkSize) {
    // [ ] Give the event loop a turn between two chunks

    // [ ] Score the items of this chunk
  }

  return results;
}
