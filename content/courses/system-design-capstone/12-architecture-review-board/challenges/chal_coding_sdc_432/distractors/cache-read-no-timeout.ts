// @piece cache-read: Read the cache, protected from a slow or failing Redis
if (!this.breaker.allowRequest()) return this.loadOnce(key);
let cached: string | null;
try {
    cached = await this.cache.get(key);
    this.breaker.recordSuccess();
} catch {
    this.breaker.recordFailure();
    return this.loadOnce(key);
}
if (cached !== null) return cached;
