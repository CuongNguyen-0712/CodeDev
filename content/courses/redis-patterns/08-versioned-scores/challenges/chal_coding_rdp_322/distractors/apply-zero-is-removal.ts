// @piece apply-update: Write the new score and remember its version
if (!totalScore) redis.zrem(BOARD, learnerId);
else redis.zadd(BOARD, totalScore, learnerId);
redis.hset(VERSIONS, learnerId, String(version));
return "applied";
