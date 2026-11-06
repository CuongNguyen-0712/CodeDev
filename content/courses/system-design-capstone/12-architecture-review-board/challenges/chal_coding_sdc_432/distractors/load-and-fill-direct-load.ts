// @piece load-and-fill: Load from PostgreSQL and fill the cache
const value = await this.store.load(key);
this.cache.set(key, value).catch(() => {});
return value;
