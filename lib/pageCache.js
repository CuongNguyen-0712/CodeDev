import { revalidateTag } from "next/cache";

// Tags of the public data that pages cache (lib/cachedData). Kept here, free of service imports,
// because the services call revalidateCoursePage.
export const cacheTags = {
    catalog: "catalog",
    course: (courseId) => `course:${courseId}`,
    roadmap: (roadmapId) => `roadmap:${roadmapId}`,
    blog: "blog",
    post: (postId) => `post:${postId}`,
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

/**
 * Marks the blog index and, when given, one post page stale. `immediate` expires the entries at
 * once ({ expire: 0 }: the next visit renders fresh) for a post that appears or disappears
 * (publish, approve, hide, remove, purge); an edit of a live post keeps "max" (served stale once).
 */
export function revalidateBlog(postId = null, { immediate = false } = {}) {
    const profile = immediate ? { expire: 0 } : "max";
    try {
        revalidateTag(cacheTags.blog, profile);
        if (postId) revalidateTag(cacheTags.post(postId), profile);
    } catch {
        // Not running inside Next.js.
    }
}
