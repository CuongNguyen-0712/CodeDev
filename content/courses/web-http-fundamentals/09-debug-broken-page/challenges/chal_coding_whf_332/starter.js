/**
 * Load a learner's progress for the progress page.
 *
 * Calls GET https://api.codedev.test/users/{userId}/progress with the injected fetch.
 * The response has { status, ok, json() }; fetch REJECTS (TypeError) when the request
 * never gets a response (offline, DNS, connection reset, or a response the browser blocked).
 *
 * cache is a small key-value store ({ get(key), set(key, value) }) that keeps the last good
 * progress per user under the key "progress:<userId>". get() returns undefined when empty.
 *
 * The fixed function makes EXACTLY ONE request per call (the "Try again" button and the retry
 * helper from lesson 3.1 decide about retries) and returns one of these outcomes:
 *   - 2xx                      -> { status: "fresh", data }        and cache.set(key, data)
 *   - 401                      -> { status: "signed_out" }         no cached data, no retry
 *   - fetch rejects, or 5xx    -> { status: "stale", data }        when the cache has an entry
 *                                 { status: "error", httpStatus }  when it does not
 *                                 (httpStatus = the status code, or null when there was no response)
 *   - any other status (403, 404, 429 ...) -> { status: "error", httpStatus }
 * The cache is written only after a 2xx and never deleted here.
 *
 * Reported bug: when the access token expires, the page keeps showing last week's numbers as if
 * they were current, nobody is asked to sign in again, and the API logs show every page view
 * hitting /progress three times with the same expired token.
 *
 * @param {string} userId
 * @param {{ fetch: Function, cache: { get(key: string): any, set(key: string, value: any): void } }} deps
 */
async function loadProgress(userId, { fetch, cache }) {
  const key = `progress:${userId}`;
  const url = `https://api.codedev.test/users/${userId}/progress`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        cache.set(key, data);
        return { status: "fresh", data };
      }
    } catch (err) {
      // the request failed: try again
    }
  }

  // still failing: show what we had last time so the page is never empty
  return { status: "fresh", data: cache.get(key) ?? null };
}
