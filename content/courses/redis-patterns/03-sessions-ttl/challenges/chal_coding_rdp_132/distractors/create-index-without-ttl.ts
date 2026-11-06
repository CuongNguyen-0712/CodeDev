// @piece create-session: Store a new session and index it under its user
const key = sessionKey(sessionId);
if (r.exists(key)) return false;
r.hset(key, "userId", userId);
r.hset(key, "device", device);
r.hset(key, "createdAt", String(clock.now));
r.expire(key, IDLE_TTL_SECONDS);
r.sadd(indexKey(userId), sessionId);
return true;
