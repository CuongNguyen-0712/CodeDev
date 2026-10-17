/**
 * Reference solution (never shipped to learners).
 * Lazy refill: tokens are recomputed from the elapsed time on every call, so the
 * bucket needs no timer and costs O(1) memory per key.
 */
function createTokenBucket({ capacity, refillPerSecond }, now) {
  let tokens = capacity;
  let last = now();

  return {
    take(cost = 1) {
      const current = now();
      const elapsedMs = Math.max(0, current - last);
      tokens = Math.min(capacity, tokens + (elapsedMs * refillPerSecond) / 1000);
      last = current;

      if (tokens >= cost) {
        tokens -= cost;
        return { allowed: true, retryAfterMs: 0 };
      }

      const missing = cost - tokens;
      return { allowed: false, retryAfterMs: Math.ceil((missing * 1000) / refillPerSecond) };
    },
  };
}
