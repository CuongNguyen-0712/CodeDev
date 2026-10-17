/**
 * Reference solution (never shipped to learners).
 */
function createLock(redis, options = {}) {
  const generateToken = options.generateToken
    || (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  return {
    async acquire(key, ttlMs) {
      const token = generateToken();
      const stored = await redis.set(key, token, { NX: true, PX: ttlMs });
      return stored === "OK" ? token : null;
    },

    async release(key, token) {
      if (!token) return false;
      return (await redis.delIfEquals(key, token)) === 1;
    },
  };
}
