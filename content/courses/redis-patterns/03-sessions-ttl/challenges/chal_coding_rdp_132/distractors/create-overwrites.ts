// @piece create-session: Store a new session and index it under its user
const key = sessionKey(sessionId);
r.hset(key, "userId", userId);
r.hset(key, "device", device);
r.hset(key, "createdAt", String(clock.now));
r.expire(key, IDLE_TTL_SECONDS);
r.sadd(indexKey(userId), sessionId);
r.expire(indexKey(userId), ABSOLUTE_LIFETIME_SECONDS);
return true;
