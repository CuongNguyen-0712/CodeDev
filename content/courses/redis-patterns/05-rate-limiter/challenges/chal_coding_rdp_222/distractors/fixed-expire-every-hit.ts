// @piece fixed-count: Count the request in the fixed window and decide
const k = `rl:fixed:${key}`;
const count = redis.incr(k);
redis.expire(k, windowSeconds);
if (count <= limit) return { allowed: true, remaining: limit - count, retryAfter: 0 };
return { allowed: false, remaining: 0, retryAfter: redis.ttl(k) };
