// @piece read-top: Answer the top n
return this.redis.zrevrange(LEADERBOARD_KEY, 0, n - 1);
