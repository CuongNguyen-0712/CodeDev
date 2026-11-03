import { adminDb } from "@/db/admin.db";
import { adminRatingDb } from "@/db/adminRating.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";

/**
 * Course ratings in the admin (docs/admin-panel-plan.md 12.5): the summary with a 1-5 histogram,
 * the ratings themselves, and hiding one (spam, an abusive account) with comment.moderate. A hidden
 * rating leaves the average (the trigger recounts); nobody edits another person's stars.
 */
export const adminRatingService = {
    get: async ({ courseId }) => {
        const summary = await adminRatingDb.summary(courseId);
        if (!summary) throw new ApiError("Course not found", 404);
        const histogram = [1, 2, 3, 4, 5].map((stars) => ({ stars, count: summary.stars.filter((value) => value === stars).length }));
        return {
            average: summary.average,
            count: summary.count,
            hidden: summary.hidden,
            histogram,
            recent: { average: summary.recent_average, count: summary.recent_count },
            items: await adminRatingDb.list(summary.course_id),
        };
    },

    setHidden: async ({ actor, courseId, userId, hidden, reason, ip = null }) => {
        const summary = await adminRatingDb.summary(courseId);
        if (!summary) throw new ApiError("Course not found", 404);

        const result = await withTransaction(async (client) => {
            const rating = await adminRatingDb.lock(client, { courseDbId: summary.course_id, userPublicId: userId });
            if (!rating) throw new ApiError("Rating not found", 404);
            if (rating.is_hidden === hidden) return { changed: false };
            await adminRatingDb.setHidden(client, { courseDbId: summary.course_id, userDbId: rating.user_id, hidden });
            await adminDb.audit(client, {
                actorId: actor.id, action: hidden ? "rating.hide" : "rating.show", targetType: "course", targetId: courseId,
                reason, before: { user: userId, stars: rating.stars, hidden: rating.is_hidden }, after: { user: userId, stars: rating.stars, hidden }, ip,
            });
            return { changed: true };
        });

        if (result.changed) {
            try {
                await redis.del(cacheKeys.courseDetailsPublic(courseId));
            } catch (error) {
                console.error("[admin] cache invalidation failed:", error?.message);
            }
        }
        return result;
    },
};
