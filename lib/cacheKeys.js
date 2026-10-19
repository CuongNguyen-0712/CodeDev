import { redis } from "@/lib/cache";

/**
 * Central place for Redis key names and TTLs (seconds).
 *
 * User-scoped caches embed a per-user version (`user:{id}:v`). Bumping the version with
 * `invalidateUserCache(userId)` makes every cached read for that user miss at once, so
 * mutations never need to know which individual keys exist.
 */

export const TTL = {
    ROADMAP_LIST: 10 * 60,
    ROADMAP_DETAILS_PUBLIC: 10 * 60,
    COURSE_DETAILS_PUBLIC: 5 * 60,
    COURSE_LIST_PUBLIC: 2 * 60,
    // Searches are long-tail: keep them briefly so repeated / paginated queries hit Redis.
    COURSE_SEARCH_PUBLIC: 60,
    COURSE_FILTER_OPTIONS: 10 * 60,
    LESSON_CONTENT: 60 * 60,
    CHALLENGE_FILE: 60 * 60,
    // Quiz answer keys / coding test definitions: read on every state, run and submit.
    CHALLENGE_DEFINITION: 10 * 60,
    // Leaderboard top 50 (ranking-plan §4); a viewer's own standing is always computed live.
    RANKING_TOP: 5 * 60,
    USER_ME: 5 * 60,
    USER_OVERVIEW: 2 * 60,
    USER_LEARNING_PROGRESS: 2 * 60,
    USER_COURSE_LIST: 60,
    USER_COURSE_PROGRESS_LIST: 60,
    USER_ROADMAP_DETAILS: 60,
    USER_VERSION: 7 * 24 * 60 * 60,
};

export const cacheKeys = {
    // auth / sessions (TTL <= session lifetime, see services/auth.service.js)
    session: (sessionId) => `session:${sessionId}`,

    // public, shared by every visitor
    roadmapList: () => "cache:roadmap:list",
    roadmapDetailsPublic: (publicId) => `cache:roadmap:${publicId}:details`,
    courseDetailsPublic: (courseId) => `cache:course:${courseId}:details`,
    courseListPublic: (hash) => `cache:course:list:${hash}`,
    courseFilterOptions: () => "cache:course:filters",
    lessonContent: (sourceId) => `cache:lesson:${sourceId}`,
    challengeFile: (objectKey) => `challenge:file:${objectKey}`,
    challengeDefinition: (challengeId, kind) => `cache:challenge:${challengeId}:${kind}`,
    rankingTop: (board, period) => `cache:ranking:${board}:${period}`,

    // per user (versioned)
    userVersion: (userId) => `user:${userId}:v`,
    userMe: (userId, v) => `cache:user:${userId}:v${v}:me`,
    userOverview: (userId, v) => `cache:user:${userId}:v${v}:overview`,
    userLearningProgress: (userId, v, courseId) => `cache:user:${userId}:v${v}:progress:${courseId}`,
    userCourseList: (userId, v, hash) => `cache:user:${userId}:v${v}:courses:${hash}`,
    userCourseProgressList: (userId, v, hash) => `cache:user:${userId}:v${v}:learning:${hash}`,
    userRoadmapDetails: (userId, v, publicId) => `cache:user:${userId}:v${v}:roadmap:${publicId}`,
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
