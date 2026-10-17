import { randomUUID } from "node:crypto";

// Lua compare-and-delete: only the holder of `token` may release the lock.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

/**
 * TODO (lesson step 5): implement a Redis lock with ioredis.
 *   acquire: SET key <random token> NX PX ttlMs  -> token, or null when held
 *   release: run RELEASE_SCRIPT                   -> true only if we still owned it
 *
 * @param {import("ioredis").Redis} redis
 */
export function createLock(redis) {
    return {
        /** @returns {Promise<string|null>} */
        async acquire(key, ttlMs) {
            void redis; void randomUUID; void key; void ttlMs;
            throw new Error("createLock().acquire is not implemented yet");
        },

        /** @returns {Promise<boolean>} */
        async release(key, token) {
            void RELEASE_SCRIPT; void key; void token;
            throw new Error("createLock().release is not implemented yet");
        },
    };
}
