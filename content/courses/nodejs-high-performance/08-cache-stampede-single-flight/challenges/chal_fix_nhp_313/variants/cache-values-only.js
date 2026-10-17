// Wrong variant: caches only resolved values -> errors are not cached, but every concurrent miss calls the provider (stampede).
function createRateCache(fetchRate, { ttlMs, now }) {
  const cache = new Map();
  return {
    async get(currency) {
      const hit = cache.get(currency);
      if (hit && hit.expiresAt > now()) return hit.value;
      const value = await fetchRate(currency);
      cache.set(currency, { value, expiresAt: now() + ttlMs });
      return value;
    },
  };
}
