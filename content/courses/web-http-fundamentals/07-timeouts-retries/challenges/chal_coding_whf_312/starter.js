/**
 * Send a request, and retry it only when the failure is worth retrying.
 *
 * Call fetch(request) - always with the same request value you were given.
 *
 * Retry (wait, then call fetch again) when:
 *   - fetch REJECTS (a network error, or a TimeoutError from AbortSignal.timeout),
 *     EXCEPT an error whose name is "AbortError": the user cancelled, so rethrow it at once;
 *   - the response status is 429, 502, 503 or 504.
 * Return every other response at once, without retrying: 2xx, 3xx, 400, 401, 403, 404,
 * 409, 422, 500, 501 ... (the same request would get the same answer, or may already have run).
 *
 * Limits and delays:
 *   - make at most `retries` retries, so at most retries + 1 calls to fetch;
 *   - before retry number n (n = 1, 2, 3 ...) call `await sleep(ms)` with
 *       ms = baseDelayMs * 2 ** (n - 1)              (100, 200, 400 with the defaults)
 *     except when the retryable response has a Retry-After header made only of digits
 *     ("0", "2", "120"): then wait that many SECONDS, ms = seconds * 1000.
 *     Any other Retry-After value (an HTTP-date, "soon") uses the backoff delay.
 *   - when no retry is left: return the last response, or rethrow the last error
 *     (the original error object, not a new one).
 *
 * Use only the fetch and sleep you are given: the tests inject fakes.
 *
 * @param {any} request  what to pass to fetch (a URL string or a Request)
 * @param {{ fetch: (request: any) => Promise<Response>, sleep: (ms: number) => Promise<void>,
 *           retries?: number, baseDelayMs?: number }} options
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
  // TODO: loop: call fetch, decide whether this failure is retryable,
  // sleep with exponential backoff (or Retry-After), and stop after `retries` retries.
  return fetch(request);
}
