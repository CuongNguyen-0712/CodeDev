/**
 * Retry an async operation with capped exponential backoff and full jitter.
 *
 * fn is called as fn({ attempt, signal }) - attempt starts at 1. Pass the signal on,
 * so an abort can cancel the attempt that is running.
 *
 * The loop, in order:
 *   1. Before every attempt: if signal is aborted, reject with signal.reason (do not call fn).
 *   2. Call fn. If it resolves, resolve with its value.
 *   3. If it rejects:
 *      - signal aborted?                       -> reject with signal.reason
 *      - !shouldRetry(error) or last attempt?  -> reject with the ORIGINAL error (no wrapping)
 *      - otherwise wait, then go to 1. The wait before retry number n (n = the attempt that
 *        just failed, starting at 1) is:
 *          error.retryAfterMs, if it is a number (the server's Retry-After wins), else
 *          Math.floor(random() * Math.min(maxDelayMs, baseMs * 2 ** (n - 1)))
 *   4. The wait is cancellable: when the signal aborts, clear the timer and reject with
 *      signal.reason immediately.
 *
 * Default shouldRetry (isRetryable below):
 *   - error.name === "AbortError"            -> false
 *   - error.status is a number               -> true only for 408, 429 and 500 or above
 *   - no status (network TypeError, timeout) -> true
 *
 * Use ONLY options.random and options.timers ({ setTimeout(cb, ms) -> id, clearTimeout(id) }):
 * the tests inject a fake clock and a fixed random sequence.
 *
 * @template T
 * @param {(ctx: { attempt: number, signal?: AbortSignal }) => Promise<T>} fn
 * @param {{
 *   maxAttempts?: number, baseMs?: number, maxDelayMs?: number,
 *   random?: () => number,
 *   timers?: { setTimeout(cb: () => void, ms: number): any, clearTimeout(id: any): void },
 *   signal?: AbortSignal,
 *   shouldRetry?: (error: any) => boolean
 * }} [options]
 * @returns {Promise<T>}
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseMs = 100,
    maxDelayMs = 10_000,
    random = Math.random,
    timers = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (id) => clearTimeout(id) },
    signal,
    shouldRetry = isRetryable,
  } = options;

  // @piece attempt: Try, and on failure wait before the next attempt
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fn({ attempt, signal });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      await sleep(backoffDelay(error, attempt), signal, timers);
    }
  }
  // @end

  // @piece backoff: How long to wait before the next attempt
  function backoffDelay(error, attempt) {
    if (typeof error?.retryAfterMs === "number") return error.retryAfterMs;
    return Math.floor(random() * Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1)));
  }
  // @end
}

// @piece sleep: A wait that the signal can cancel
function sleep(ms, signal, timers) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      timers.clearTimeout(id);
      reject(signal.reason);
    };
    const id = timers.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
// @end

function isRetryable(error) {
  // @piece classify: Which errors are worth another attempt
  if (error?.name === "AbortError") return false;
  if (typeof error?.status === "number") {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return true;
  // @end
}
