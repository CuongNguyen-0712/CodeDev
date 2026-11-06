// @piece expiry-with-jitter: When this copy expires, and when its refresh starts
long expiresAt = now + TTL_MS;
cache.put(key, value, expiresAt, expiresAt);
