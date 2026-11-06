// @piece cache-read: Read the cache, protected from a slow or failing Redis
const cached = await this.cache.get(key); // Redis sits in front of every catalog and session read
if (cached !== null) return cached;
