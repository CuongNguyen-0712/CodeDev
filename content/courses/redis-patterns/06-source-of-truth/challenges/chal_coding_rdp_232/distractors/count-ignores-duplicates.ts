// @piece count-event: Record a valid score event
await this.db.insertScoreEvent(event);
// A ZINCRBY on a missing key would create a leaderboard holding one learner.
if (this.redis.exists(LEADERBOARD_KEY) === 1) this.redis.zincrby(LEADERBOARD_KEY, event.points, event.userId);
