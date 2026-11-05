import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { isDeployedEnv } from "@/lib/appEnv.mjs";
import { ApiError } from "@/lib/error/apiError";

/**
 * Lesson bodies come from one store per environment (docs/payload-cms.md):
 *   production, staging  -> Sanity (the dataset learners read; written by content/tools/push-lesson.mjs)
 *   local development    -> the local Payload CMS (cms/, written by content/tools/payload-sync.mjs)
 * LESSON_CONTENT_SOURCE=sanity|payload overrides the choice (e.g. checking Sanity from a laptop).
 * Answers, test cases and starter files live in Postgres / S3 in every environment.
 */
export function lessonSource(env = process.env) {
    const explicit = String(env.LESSON_CONTENT_SOURCE || "").trim().toLowerCase();
    if (explicit === "sanity" || explicit === "payload") return explicit;
    return isDeployedEnv(env) ? "sanity" : "payload";
}

const LESSON_QUERY = `*[_type == "lesson" && _id == $id][0]{
    title,
    slug,
    description,
    estimatedTime,
    scenario,
    environmentSetup,
    content
}`;

async function getSanityLesson(source) {
    // Loaded on demand: a local checkout reading Payload needs no Sanity configuration.
    const { client } = await import("@/lib/sanity");
    return client.fetch(LESSON_QUERY, { id: source });
}

const PAYLOAD_TIMEOUT_MS = 3000;

/**
 * The lesson body from the local Payload CMS, in the Sanity query shape, or null when it has no
 * such lesson. Throws 503 when the CMS is not configured or cannot be reached, so a missing
 * `npm run cms:up` is not mistaken for a missing lesson.
 */
export async function getPayloadLesson(source, { env = process.env, fetchImpl = fetch } = {}) {
    if (!env.PAYLOAD_URL || !env.PAYLOAD_API_KEY) {
        throw new ApiError("The local lesson store is not configured: set PAYLOAD_URL and PAYLOAD_API_KEY and run npm run cms:up (docs/payload-cms.md).", 503, { expose: true });
    }

    const url = new URL("/api/lessons", env.PAYLOAD_URL);
    url.searchParams.set("where[sourceId][equals]", source);
    url.searchParams.set("limit", "1");
    url.searchParams.set("depth", "0");

    let response;
    try {
        response = await fetchImpl(url, {
            headers: { Authorization: `users API-Key ${env.PAYLOAD_API_KEY}` },
            signal: AbortSignal.timeout(PAYLOAD_TIMEOUT_MS),
            cache: "no-store",
        });
    } catch (error) {
        console.warn(`[lessonContent] Payload unreachable for ${source}: ${error?.name || error}`);
        throw new ApiError("The local lesson store is not running: start it with npm run cms:up.", 503, { expose: true });
    }
    if (!response.ok) {
        console.warn(`[lessonContent] Payload answered ${response.status} for ${source}`);
        throw new ApiError(`The local lesson store answered ${response.status}: check PAYLOAD_API_KEY.`, 503, { expose: true });
    }

    const doc = (await response.json())?.docs?.[0];
    if (!doc || !Array.isArray(doc.content)) return null;
    return {
        title: doc.title,
        slug: doc.slug ? { _type: "slug", current: doc.slug } : null,
        description: doc.description ?? null,
        estimatedTime: doc.estimatedTime ?? null,
        scenario: doc.scenario ?? null,
        environmentSetup: doc.environmentSetup ?? null,
        content: doc.content,
    };
}

/**
 * Lesson body by its id (`course.lesson.content_source`, the Sanity _id and Payload sourceId),
 * from this environment's store only. The body is the same for every learner, so it is cached;
 * callers must check access to the lesson first. A missing body is not cached.
 */
export function getLessonContent(source) {
    return redis.remember(cacheKeys.lessonContent(source), TTL.LESSON_CONTENT, () =>
        lessonSource() === "sanity" ? getSanityLesson(source) : getPayloadLesson(source)
    );
}

// Starter projects are public course files in object storage, under courses/.
export function isLessonAssetKey(key) {
    return typeof key === "string" && /^courses\/[a-z0-9-]+\/[a-z0-9-]+\/[\w.-]+$/i.test(key) && !key.includes("..");
}
