// @piece apply-event: Apply one delivered event
const seenKey = `lb:seen:${event.eventId}`; // exists once this event was processed
if (this.redis.exists(seenKey) === 1) return "duplicate";

const stored = this.redis.hget("lb:version", event.userId); // version of the learner's last applied event
const current = this.redis.zscore(LEADERBOARD, event.userId);
const isNewer = current === null || event.total > current;
if (isNewer) {
    this.redis.zadd(LEADERBOARD, event.total, event.userId);
    this.redis.hset("lb:version", event.userId, String(event.version));
}
// The queue redelivers an unacknowledged message for up to 24 hours: keep the marker twice as long.
// In production these commands run as one Lua script, so a crash cannot split them.
this.redis.set(seenKey, "1", { ex: 48 * 60 * 60 });
return isNewer ? "applied" : "stale";
