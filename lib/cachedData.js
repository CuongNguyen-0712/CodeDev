import { cacheLife, cacheTag } from "next/cache";

import { courseService } from "@/services/course.service";
import { roadmapService } from "@/services/roadmap.service";
import { cacheTags } from "@/lib/pageCache";

/**
 * Public data that pages prerender ('use cache', Cache Components). Each entry carries a tag, and
 * lib/pageCache drops it where the matching Redis copy is dropped; the lifetime is only the safety
 * net and mirrors the Redis TTL (lib/cacheKeys). Errors are never cached: callers catch them.
 */

/** Course, lesson, language and roadmap counts shown on the landing and about pages. */
export async function getCatalogStats() {
    "use cache";
    cacheLife({ stale: 300, revalidate: 600, expire: 86_400 });
    cacheTag(cacheTags.catalog);
    return courseService.getCatalogStats();
}

/** Public course page (null when it is not published); the viewer's part loads in the browser. */
export async function getPublicCourse(courseId) {
    "use cache";
    cacheLife({ stale: 300, revalidate: 300, expire: 86_400 });
    cacheTag(cacheTags.course(courseId));
    return courseService.getDetails({ courseId });
}

/** Whether the course exists at all (published or not): a missing one is a cached 404. */
export async function courseExists(courseId) {
    "use cache";
    cacheLife({ stale: 300, revalidate: 300, expire: 86_400 });
    cacheTag(cacheTags.course(courseId));
    return courseService.exists(courseId);
}

/** Guest view of a roadmap (throws ApiError 404 for an unknown id). */
export async function getPublicRoadmap(roadmapId) {
    "use cache";
    cacheLife({ stale: 300, revalidate: 600, expire: 86_400 });
    cacheTag(cacheTags.roadmap(roadmapId));
    return roadmapService.getDetails({ publicId: roadmapId });
}

/** Course ids prerendered at build time (newest published); the rest are generated on first visit. */
export async function getPrerenderedCourseIds(limit = 12) {
    const { data } = await courseService.getList({ limit });
    return data.map((course) => course.id);
}
