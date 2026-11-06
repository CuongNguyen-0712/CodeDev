// @piece load-and-fill: Load from PostgreSQL and fill the cache
const value = await this.store.load(key);
await this.cache.set(key, value);
return value;
