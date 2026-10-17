/**
 * Reference solution (never shipped to learners).
 * Keep caching the promise (so concurrent misses share one request), but evict the
 * entry when it rejects - and only if it is still the entry we created.
 */
function createRateCache(fetchRate, { ttlMs, now }) {
  const cache = new Map();

  return {
    get(currency) {
      const hit = cache.get(currency);
      if (hit && hit.expiresAt > now()) {
        return hit.promise;
      }

      const promise = fetchRate(currency);
      const entry = { promise, expiresAt: now() + ttlMs };
      cache.set(currency, entry);

      promise.catch(() => {
        if (cache.get(currency) === entry) cache.delete(currency);
      });

      return promise;
    },
  };
}
