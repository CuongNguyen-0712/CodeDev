// @piece read-top: Answer the top n
for (const { userId, total } of await this.db.totalsByUser()) this.redis.zadd(LEADERBOARD_KEY, total, userId);
return this.redis.zrevrange(LEADERBOARD_KEY, 0, n - 1);
