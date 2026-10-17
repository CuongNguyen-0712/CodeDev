/**
 * A DataLoader-style batch loader. Code all over a request handler calls
 * `loader.load(productId)`; every load made in the same tick must be coalesced into
 * ONE call of `batchFn(keys)` instead of one database round trip per key.
 *
 * batchFn(keys) resolves to an array aligned with `keys`:
 *   values[i] is the value for keys[i], or an Error instance when that key failed
 *   (for example a product that does not exist). batchFn itself may also reject.
 *
 * Requirements:
 *   - load(key) returns a Promise of that key's value
 *   - collect keys until the current synchronous code is done, then flush once
 *     (schedule the flush with queueMicrotask when the first key of a batch arrives)
 *   - the same key loaded twice in one batch is sent to batchFn once; both callers get the value
 *   - keys are sent in the order they were first loaded, split into chunks of at most
 *     options.maxBatchSize keys (one batchFn call per chunk; no limit when not given)
 *   - an Error at values[i] rejects only the callers of keys[i]; everyone else resolves
 *   - if batchFn rejects, every caller in that chunk rejects with the same error
 *   - no caching across batches: a key loaded again in a later tick is fetched again
 *
 * @template K, V
 * @param {(keys: K[]) => Promise<Array<V | Error>>} batchFn
 * @param {{ maxBatchSize?: number }} [options]
 * @returns {{ load(key: K): Promise<V> }}
 */
function createBatchLoader(batchFn, options = {}) {
  return {
    /**
     * @param {K} key
     * @returns {Promise<V>}
     */
    load(key) {
      // TODO: queue the key and return a promise settled when its batch comes back
    },
  };
}
