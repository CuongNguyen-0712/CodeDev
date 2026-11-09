import { revalidateTag } from "next/cache";

// Tags of the public data that pages cache (lib/cachedData). Kept here, free of service imports,
// because the services call revalidateCoursePage.
export const cacheTags = {
    catalog: "catalog",
    course: (courseId) => `course:${courseId}`,
    roadmap: (roadmapId) => `roadmap:${roadmapId}`,
};

/**
 * Marks a public course page stale (its 'use cache' entry in lib/cachedData and every page built
 * from it) after its public data changed, in the same places that drop the Redis copy
 * (cacheKeys.courseDetailsPublic). The next visit is served the old copy while a new one renders
 * ("max"). Outside a Next.js request (scripts, tests) there is no page cache to drop.
 */
export function revalidateCoursePage(courseId) {
    if (!courseId) return;
    try {
        revalidateTag(cacheTags.course(courseId), "max");
    } catch {
        // Not running inside Next.js.
    }
}

/** Same for the catalog figures (cacheKeys.catalogStats) on the landing and about pages. */
export function revalidateCatalogStats() {
    try {
        revalidateTag(cacheTags.catalog, "max");
    } catch {
        // Not running inside Next.js.
    }
}

/** Marks the blog index and, when given, one post page stale. */
export function revalidateBlog(postId = null) {
    try {
        revalidateTag(cacheTags.blog, "max");
        if (postId) revalidateTag(cacheTags.post(postId), "max");
    } catch {
        // Not running inside Next.js.
    }
}
