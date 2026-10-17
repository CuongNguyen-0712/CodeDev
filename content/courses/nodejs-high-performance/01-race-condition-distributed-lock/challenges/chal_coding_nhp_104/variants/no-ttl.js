// Wrong variant: no PX -> the lock never expires, so a crashed holder blocks the wallet forever.
function createLock(redis, options = {}) {
  const generateToken = options.generateToken || (() => Math.random().toString(36).slice(2));
  return {
    async acquire(key) {
      const token = generateToken();
      return (await redis.set(key, token, { NX: true })) === "OK" ? token : null;
    },
    async release(key, token) {
      return (await redis.delIfEquals(key, token)) === 1;
    },
  };
}
