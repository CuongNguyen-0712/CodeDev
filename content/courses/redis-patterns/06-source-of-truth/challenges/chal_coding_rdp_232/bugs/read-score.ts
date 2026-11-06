// @piece read-score: Answer one learner's score
return this.redis.zscore(LEADERBOARD_KEY, userId) ?? 0;
