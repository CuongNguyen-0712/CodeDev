// @piece load-and-store: Load from PostgreSQL and keep a copy
const course = deps.db.findCourseById(id); // throws when the database is down: nothing is cached
if (course === null) {
    deps.redis.set(key, "null", { ex: NOT_FOUND_TTL_SECONDS });
} else {
    const ttl = COURSE_TTL_SECONDS;
    deps.redis.set(key, JSON.stringify(course), { ex: ttl });
}
return course;
