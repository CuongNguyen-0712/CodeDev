// @piece load-and-store: Load from PostgreSQL and keep a copy
const course = deps.db.findCourseById(id); // throws when the database is down: nothing is cached
if (course !== null) {
    const ttl = COURSE_TTL_SECONDS + Math.floor(deps.random() * (COURSE_TTL_JITTER_SECONDS + 1));
    deps.redis.set(key, JSON.stringify(course), { ex: ttl });
}
return course;
