// @piece count-event: Record a valid score event
this.redis.zincrby(LEADERBOARD_KEY, event.points, event.userId);
