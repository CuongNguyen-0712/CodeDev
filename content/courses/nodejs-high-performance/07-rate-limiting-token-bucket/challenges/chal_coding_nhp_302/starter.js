/**
 * Token bucket rate limiter for one API key.
 *
 * - The bucket starts FULL with `capacity` tokens.
 * - Tokens refill continuously at `refillPerSecond` tokens per second, but the bucket
 *   never holds more than `capacity` tokens (an idle client cannot save up a huge burst).
 * - take(cost) succeeds when the bucket holds at least `cost` tokens: it removes them and
 *   returns { allowed: true, retryAfterMs: 0 }.
 * - Otherwise nothing is removed and it returns { allowed: false, retryAfterMs }, where
 *   retryAfterMs is how long until enough tokens have refilled for this request
 *   (the API turns it into a `Retry-After` header).
 *
 * Do not use timers or Date.now(): read the current time (in milliseconds) from `now()`.
 *
 * @param {{ capacity: number, refillPerSecond: number }} options
 * @param {() => number} now current time in milliseconds
 * @returns {{ take(cost?: number): { allowed: boolean, retryAfterMs: number } }}
 */
function createTokenBucket({ capacity, refillPerSecond }, now) {
  // [ ] The bucket's tokens and the time they were counted

  return {
    /**
     * @param {number} [cost=1] tokens this request needs
     * @returns {{ allowed: boolean, retryAfterMs: number }}
     */
    take(cost = 1) {
      // [ ] Add the tokens earned since the last call

      // [ ] Allow the request when there are enough tokens

      // [ ] Deny it and say how long to wait
    },
  };
}
