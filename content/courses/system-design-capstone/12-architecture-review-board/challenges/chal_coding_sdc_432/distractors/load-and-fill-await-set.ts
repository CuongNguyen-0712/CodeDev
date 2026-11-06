// @piece load-and-fill: Load from PostgreSQL and fill the cache
const value = await this.loadOnce(key);
await this.cache.set(key, value).catch(() => {});
return value;
