// @piece read-cache: Answer from Redis when the copy is readable
const key = `course:${id}`;
const cached = deps.redis.get(key);
if (cached !== null) {
    return JSON.parse(cached) as Course | null;
}
