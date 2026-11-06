// @piece evict-idle: Forget idle buckets that are already full
for (const [key, bucket] of this.buckets) {
    if (now - bucket.last >= this.config.idleTtlMs) this.buckets.delete(key);
}
