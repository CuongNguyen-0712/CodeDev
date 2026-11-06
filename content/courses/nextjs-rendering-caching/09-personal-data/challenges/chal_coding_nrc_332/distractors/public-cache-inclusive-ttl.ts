// @piece public-cache: Public course data through the shared cache
const key = `course:${courseId}`;
const hit = deps.sharedCache.get(key) as CachedCourse | undefined;
if (hit && at <= hit.storedAt + ttl) return hit.course;
const course = deps.loadPublicCourse(courseId);
if (course) deps.sharedCache.set(key, { course, storedAt: at } satisfies CachedCourse);
return course;
