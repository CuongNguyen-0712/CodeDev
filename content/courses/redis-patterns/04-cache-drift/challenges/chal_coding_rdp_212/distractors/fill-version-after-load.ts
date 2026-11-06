// @piece fill-cache: Load on a miss and store the copy
const value = await load();
const version = this.redis.get(`${key}:ver`);
// An invalidation ran while we were loading: our value may be older than the database.
if (this.redis.get(`${key}:ver`) === version) {
    this.redis.set(key, JSON.stringify(value), { ex: CACHE_TTL_SECONDS });
}
