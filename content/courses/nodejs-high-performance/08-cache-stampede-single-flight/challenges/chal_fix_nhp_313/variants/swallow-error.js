// Wrong variant: turns the failure into null -> callers get no error, and the null rate is cached for the whole TTL.
function createRateCache(fetchRate, { ttlMs, now }) {
  const cache = new Map();
  return {
    get(currency) {
      const hit = cache.get(currency);
      if (hit && hit.expiresAt > now()) return hit.promise;
      const promise = fetchRate(currency).catch(() => null);
      cache.set(currency, { promise, expiresAt: now() + ttlMs });
      return promise;
    },
  };
}
