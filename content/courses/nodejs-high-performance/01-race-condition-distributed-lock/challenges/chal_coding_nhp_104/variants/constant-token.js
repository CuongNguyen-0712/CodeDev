// Wrong variant: one constant token for every holder -> a stale holder can release the new holder's lock.
function createLock(redis) {
  return {
    async acquire(key, ttlMs) {
      return (await redis.set(key, "locked", { NX: true, PX: ttlMs })) === "OK" ? "locked" : null;
    },
    async release(key, token) {
      return (await redis.delIfEquals(key, token)) === 1;
    },
  };
}
