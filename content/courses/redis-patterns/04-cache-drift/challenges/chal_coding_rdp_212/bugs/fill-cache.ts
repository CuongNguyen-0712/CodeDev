// @piece fill-cache: Load on a miss and store the copy
const value = await load();
this.redis.set(key, JSON.stringify(value), { ex: CACHE_TTL_SECONDS });
