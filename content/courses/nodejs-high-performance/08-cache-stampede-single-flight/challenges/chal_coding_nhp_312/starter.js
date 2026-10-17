/**
 * Request coalescing ("single-flight"): wrap an async loader so that concurrent callers
 * asking for the same key share ONE call to the loader.
 *
 * Requirements for the returned function load(key):
 *   - while a load for `key` is in flight, further load(key) calls do NOT call `fn` again;
 *     they get the same result (or the same error) as the call already running
 *   - different keys are independent: load("a") never waits for load("b")
 *   - if the loader rejects, EVERY waiter for that key sees the rejection
 *   - once the load settles (resolved or rejected) the key is forgotten, so the next
 *     load(key) calls `fn` again - this is coalescing, not a cache
 *
 * @template T
 * @param {(key: string) => Promise<T>} fn the expensive loader (e.g. a database query)
 * @returns {(key: string) => Promise<T>}
 */
function singleFlight(fn) {
  // TODO: keep track of the in-flight promise per key
  return async function load(key) {
    return fn(key);
  };
}
