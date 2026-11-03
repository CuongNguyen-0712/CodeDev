import { revalidatePath } from "next/cache";

/**
 * Drops the ISR copy of a public course page (app/course/[id]) after its public data changed, in
 * the same places that drop the Redis copy (cacheKeys.courseDetailsPublic). The page regenerates
 * on the next visit. Outside a Next.js request (scripts, tests) there is no page cache to drop.
 */
export function revalidateCoursePage(courseId) {
    if (!courseId) return;
    try {
        revalidatePath(`/course/${courseId}`);
    } catch {
        // Not running inside Next.js.
    }
}
