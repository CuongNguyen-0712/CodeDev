import { redis } from "@/lib/cache";

/**
 * Central place for Redis key names and TTLs (seconds).
 *
 * User-scoped caches embed a per-user version (`user:{id}:v`). Bumping the version with
 * `invalidateUserCache(userId)` makes every cached read for that user miss at once, so
 * mutations never need to know which individual keys exist.
 */

export const TTL = {
    SESSION: 30 * 24 * 60 * 60,
    SESSION_ROTATION: 120,
    ROADMAP_LIST: 10 * 60,
    COURSE_DETAILS_PUBLIC: 5 * 60,
    COURSE_LIST_PUBLIC: 2 * 60,
    LESSON_CONTENT: 60 * 60,
    CHALLENGE_FILE: 60 * 60,
    USER_ME: 5 * 60,
    USER_OVERVIEW: 2 * 60,
    USER_LEARNING_PROGRESS: 2 * 60,
    USER_VERSION: 7 * 24 * 60 * 60,
};

export const cacheKeys = {
    // auth / sessions
    session: (sessionId) => `session:${sessionId}`,
    sessionRotation: (sessionId) => `session:rotation:${sessionId}`,

    // public, shared by every visitor
    roadmapList: () => "cache:roadmap:list",
    courseDetailsPublic: (courseId) => `cache:course:${courseId}:details`,
    courseListPublic: (hash) => `cache:course:list:${hash}`,
    lessonContent: (sourceId) => `cache:lesson:${sourceId}`,
    challengeFile: (objectKey) => `challenge:file:${objectKey}`,

    // per user (versioned)
    userVersion: (userId) => `user:${userId}:v`,
    userMe: (userId, v) => `cache:user:${userId}:v${v}:me`,
    userOverview: (userId, v) => `cache:user:${userId}:v${v}:overview`,
    userLearningProgress: (userId, v, courseId) => `cache:user:${userId}:v${v}:progress:${courseId}`,
};

export async function getUserCacheVersion(userId) {
    const v = await redis.get(cacheKeys.userVersion(userId));
    return Number(v) || 0;
}

/** Drops every versioned cache entry for the user (old entries expire on their own TTL). */
export async function invalidateUserCache(userId) {
    if (!userId) return;
    try {
        await redis.incr(cacheKeys.userVersion(userId), TTL.USER_VERSION);
    } catch (error) {
        console.error("[cache] invalidateUserCache failed:", error?.message);
    }
}

/** `remember` for a user-scoped key built from the current version. */
export async function rememberForUser(userId, buildKey, ttlSeconds, loader) {
    const v = await getUserCacheVersion(userId);
    return redis.remember(buildKey(v), ttlSeconds, loader);
}
