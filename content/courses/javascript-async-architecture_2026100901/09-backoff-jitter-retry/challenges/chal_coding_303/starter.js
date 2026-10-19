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

  // TODO: the retry loop, and a cancellable wait built on timers.setTimeout / clearTimeout.
}

function isRetryable(error) {
  // TODO: classify the error (see the rules above).
  return false;
}
