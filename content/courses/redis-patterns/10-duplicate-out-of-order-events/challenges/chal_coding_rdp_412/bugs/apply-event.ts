// @piece apply-event: Apply one delivered event
this.redis.zadd(LEADERBOARD, event.total, event.userId);
return "applied";
