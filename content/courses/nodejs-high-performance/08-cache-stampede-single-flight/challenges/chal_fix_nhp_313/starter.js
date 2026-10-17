/**
 * In-process cache for FX rates used by the checkout service.
 *
 * The PROMISE is cached (not the value), so concurrent checkouts that miss at the same
 * time share one call to the FX provider. Entries live for `ttlMs`.
 *
 * BUG: last night the FX provider timed out for two seconds, and for the next ten
 * minutes every checkout in that currency failed with FX_PROVIDER_DOWN - even though the
 * provider was healthy again after those two seconds. Successful rates must still be
 * cached for ttlMs, and concurrent callers must still share one in-flight request.
 *
 * @param {(currency: string) => Promise<string>} fetchRate calls the FX provider
 * @param {{ ttlMs: number, now: () => number }} options `now()` returns the time in ms
 * @returns {{ get(currency: string): Promise<string> }}
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
      cache.set(currency, { promise, expiresAt: now() + ttlMs });
      return promise;
    },
  };
}
