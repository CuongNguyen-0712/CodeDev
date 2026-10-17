/**
 * Calls the fraud-scoring service with a hard deadline.
 *
 * `fn(signal)` starts the HTTP request (think fetch(url, { signal })). It must be given an
 * AbortSignal so the request can be cancelled. The timers come from `clock` (same API as the
 * global setTimeout / clearTimeout) so tests can run on fake time.
 *
 * Expected behaviour:
 *   - fn settles first      -> resolve / reject with fn's result
 *   - the deadline hits first -> reject with an Error whose code is "ETIMEDOUT"
 *
 * BUG: under load the service leaks memory and sockets: thousands of timers stay scheduled
 * after fast responses, and requests that "timed out" keep running in the background.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fn
 * @param {number} timeoutMs
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} clock
 * @returns {Promise<T>}
 */
async function callWithTimeout(fn, timeoutMs, clock) {
  const controller = new AbortController();

  const timeout = new Promise((_, reject) => {
    clock.setTimeout(() => {
      reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
  });

  return Promise.race([fn(controller.signal), timeout]);
}
