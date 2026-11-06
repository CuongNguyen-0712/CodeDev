// @piece count-event: Record a valid score event
if (!(await this.db.insertScoreEvent(event))) return "duplicate";
this.redis.zincrby(LEADERBOARD_KEY, event.points, event.userId);
