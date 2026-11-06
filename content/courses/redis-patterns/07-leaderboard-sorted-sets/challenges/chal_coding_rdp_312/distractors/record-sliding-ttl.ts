// @piece record-scores: Add the points to all-time and to the event's week
redis.zincrby(ALL_TIME, points, learnerId);
const retentionEnd = weekStart(ts) + 14 * DAY_MS;
if (retentionEnd <= now) return true;
const key = weekKey(ts);
redis.zincrby(key, points, learnerId);
redis.expire(key, 14 * 86_400);
return true;
