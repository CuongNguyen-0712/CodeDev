/**
 * Build a minimal Redis-style distributed lock.
 *
 * `redis` exposes only these async commands:
 *   redis.set(key, value, { NX: true, PX: ttlMs })  -> 'OK' when stored, null when the key already exists
 *   redis.get(key)                                  -> the value, or null (expired keys return null)
 *   redis.delIfEquals(key, value)                   -> 1 when the key held `value` and was deleted, else 0
 *                                                      (atomic - the same as the Lua compare-and-delete script)
 *
 * Requirements:
 *   - acquire(key, ttlMs) stores a NEW unique token per call and returns it, or null when the lock is held
 *   - the lock must expire on its own after ttlMs (a crashed holder never blocks the wallet forever)
 *   - release(key, token) frees the lock only if `token` still owns it, and returns true/false
 *
 * @param {object} redis
 * @param {{ generateToken?: () => string }} [options] use options.generateToken() to create tokens when given
 */
function createLock(redis, options = {}) {
  return {
    /**
     * @param {string} key
     * @param {number} ttlMs
     * @returns {Promise<string|null>}
     */
    async acquire(key, ttlMs) {
      // TODO: try to take the lock with a fresh token
    },

    /**
     * @param {string} key
     * @param {string} token
     * @returns {Promise<boolean>}
     */
    async release(key, token) {
      // TODO: free the lock only if this token still owns it
    },
  };
}
