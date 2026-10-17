import { client } from "@/lib/sanity";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";

// Narrative of a lesson (Sanity). Answers, test cases and starter files live in Postgres / S3.
const LESSON_QUERY = `*[_type == "lesson" && _id == $id][0]{
    title,
    slug,
    description,
    estimatedTime,
    scenario,
    environmentSetup,
    content
}`;

/**
 * Lesson body by its Sanity id (`course.lesson.content_source`). The body is the same for
 * every learner, so it is cached; callers must check access to the lesson first.
 */
export function getLessonContent(source) {
    return redis.remember(cacheKeys.lessonContent(source), TTL.LESSON_CONTENT, () =>
        client.fetch(LESSON_QUERY, { id: source })
    );
}

// Starter projects are public course files in object storage, under courses/.
export function isLessonAssetKey(key) {
    return typeof key === "string" && /^courses\/[a-z0-9-]+\/[a-z0-9-]+\/[\w.-]+$/i.test(key) && !key.includes("..");
}
