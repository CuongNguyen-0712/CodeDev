import crypto from "crypto";

import { courseDb } from "@/db/course.db";
import { ApiError } from "@/lib/error/apiError";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL, invalidateUserCache, rememberForUser } from "@/lib/cacheKeys";
import { listCacheIdentity } from "@/lib/listFilters";
import { publish, publishToUser } from "@/lib/pusher";
import { channels, events, progressReasons } from "@/lib/realtime";
import { challengeService } from "@/services/challenge.service";

/** Cache + realtime side effects after a write that changes a user's learning state. */
async function afterProgressChange({ userId, courseId, reason }) {
    await invalidateUserCache(userId);
    if (courseId && (reason === progressReasons.REGISTERED || reason === progressReasons.WITHDRAWN)) {
        // Learner counts on the public course page changed.
        await redis.del(cacheKeys.courseDetailsPublic(courseId));
    }
    publishToUser(userId, events.PROGRESS_UPDATED, { courseId: courseId || null, reason });
}

/** Short hash of a normalised list query (search case-folded, filters canonical). */
function listHash(kind, state, extra) {
    return crypto.createHash("sha1").update(listCacheIdentity(kind, state, extra)).digest("hex").slice(0, 16);
}

export const courseService = {
    getDetails: async (data) => {
        const load = async () => {
            const response = await courseDb.getCourseDetails(data);

            if (!response) {
                throw new Error('Failed to fetch course details, try again later');
            }

            return response.rows[0] ?? null;
        };

        // Signed-in visitors get their own status/progress columns: never share those.
        if (data?.userId || !data?.courseId) return load();

        return redis.remember(cacheKeys.courseDetailsPublic(data.courseId), TTL.COURSE_DETAILS_PUBLIC, load);
    },

    /**
     * Catalog list. `filter` comes from lib/listFilters (validated). Results are cached per
     * normalised query: guests share one entry, signed-in users get a versioned per-user entry
     * because enrolment hides courses and fills `is_registered`.
     */
    getList: async ({ userId = null, search = "", filter = {}, lastId = null, limit = 20 } = {}) => {
        const hash = listHash("course", { search, filter }, { lastId, limit });
        const load = () => courseService.loadList({ userId, search, filter, lastId, limit });

        if (!userId) {
            const ttl = search ? TTL.COURSE_SEARCH_PUBLIC : TTL.COURSE_LIST_PUBLIC;
            return redis.remember(cacheKeys.courseListPublic(hash), ttl, load);
        }

        return rememberForUser(userId, (v) => cacheKeys.userCourseList(userId, v, hash), TTL.USER_COURSE_LIST, load);
    },

    loadList: async ({ userId = null, search = "", filter = {}, lastId = null, limit = 20 }) => {
        const response = await courseDb.getCourseList({
            userId,
            search,
            levels: filter.level || [],
            price: filter.price?.[0] || null,
            minRating: Number(filter.rating?.[0]) || null,
            languageIds: (filter.language || []).map(Number),
            categoryIds: (filter.category || []).map(Number),
            roleCodes: filter.role || [],
            industryCodes: filter.industry || [],
            skillCodes: filter.skill || [],
            lastId,
            limit,
            // Searching also finds the courses the learner is already enrolled in.
            hideEnrolled: Boolean(userId) && !search,
        });

        if (!response) {
            throw new Error('Failed to fetch course list, try again later');
        }

        const hasMore = response.rowCount > limit;
        const data = response.rows.slice(0, limit);

        return {
            data,
            hasMore,
            lastId: hasMore ? data[data.length - 1]?.id : null
        };
    },

    /** Filter options that actually match courses: languages and categories with counts. */
    getFilterOptions: async () => {
        return redis.remember(cacheKeys.courseFilterOptions(), TTL.COURSE_FILTER_OPTIONS, async () => {
            const response = await courseDb.getCourseFilterOptions();
            const pick = (kind) => response.rows
                .filter((row) => row.kind === kind)
                .map(({ id, name, courses }) => ({ id: String(id), name, courses: Number(courses) }));

            return {
                languages: pick("language"),
                categories: pick("category"),
                roles: pick("role"),
                industries: pick("industry"),
                skills: pick("skill"),
            };
        });
    },

    postRegister: async (data) => {
        const response = await courseDb.postRegister(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to register for the course, try again later');
        }

        const course = response.rows[0];

        await afterProgressChange({ userId: data.userId, courseId: data.courseId, reason: progressReasons.REGISTERED });

        return !!course;
    },

    postWithdraw: async (data) => {
        const response = await courseDb.postWithdraw(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to withdraw from the course, try again later');
        }

        await afterProgressChange({ userId: data.userId, courseId: data.courseId, reason: progressReasons.WITHDRAWN });

        return true;
    },

    /**
     * Saves the resume point (lesson + course last_seen) and drops the user's cached views, so
     * "continue where you left off" and the My learning order never read a stale lesson.
     */
    recordLessonVisit: async ({ userId, courseId, lessonId }) => {
        const response = await courseDb.touchLesson({ userId, courseId, lessonId });
        const touched = Number(response?.rows?.[0]?.lessons) > 0;

        if (touched) {
            // last_seen orders "My learning" and the overview: drop every cached view of the user.
            await invalidateUserCache(userId);
        }

        return { recorded: touched };
    },

    getLearning: async (data) => {
        const response = await courseDb.getLearning(data);

        if (!response || response.rowCount === 0) {
            throw new ApiError('This lesson is locked or you are not registered for its course', 403);
        }

        const learning = response.rows[0];

        return learning;
    },

    postSubmitLesson: async (data) => {
        // submit_lesson() does not check unlock state, so guard it here.
        const statusRes = await courseDb.getLessonStatus(data);
        const lessonStatus = statusRes?.rows?.[0]?.status;

        if (!lessonStatus) {
            throw new ApiError('You are not registered for this lesson', 403);
        }

        if (lessonStatus === 'enrolled') {
            throw new ApiError('Complete the previous lessons to unlock this one', 403);
        }

        // Completing a lesson unlocks the next one, so every challenge must be passed first.
        await challengeService.assertLessonChallengesPassed({ userId: data.userId, lessonId: data.lessonId });

        const response = await courseDb.postSubmitLesson(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to submit lesson, try again later');
        }

        const course = response.rows[0];

        await afterProgressChange({ userId: data.userId, courseId: data.courseId, reason: progressReasons.LESSON_COMPLETED });

        return !!course;
    },

    postFavorite: async (data) => {
        const response = await courseDb.postFavorite(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to favorite course, try again later');
        }

        await afterProgressChange({ userId: data.userId, courseId: data.courseId, reason: progressReasons.FAVORITE_CHANGED });

        return true;
    },

    getComments: async (params) => {
        const response = await courseDb.getComments(params);

        if (!response) {
            throw new Error('Failed to fetch comments, try again later');
        }

        const LIMIT = 20
        const hasMore = response.rowCount > LIMIT
        const data = response.rows.slice(0, LIMIT).map((item) => ({
            ...item,
            upvotes: Number(item.upvotes) || 0,
            downvotes: Number(item.downvotes) || 0,
            vote: item.vote || null,
        }));

        return {
            data,
            hasMore,
            lastCreated: hasMore ? data[LIMIT - 1]?.created_at : null
        }
    },

    postComment: async (data) => {
        const response = await courseDb.postComment(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to post comment, try again later');
        }

        const comment = response.rows[0];

        if (data.courseId) {
            await publish(channels.course(data.courseId), events.COMMENT_CREATED, {
                id: comment.id,
                user_id: comment.user_id,
                username: comment.username,
                avatar: comment.avatar,
                comment: comment.comment,
                upvotes: Number(comment.upvotes) || 0,
                downvotes: Number(comment.downvotes) || 0,
                created_at: comment.created_at,
                vote: null,
            });
        }

        return comment || true;
    },

    postVotingComment: async (data) => {
        const response = await courseDb.postVotingComment(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to vote on comment, try again later');
        }

        const voteRow = response.rows[0];
        const result = {
            commentId: data.commentId,
            upvotes: Number(voteRow.upvotes) || 0,
            downvotes: Number(voteRow.downvotes) || 0,
            vote: voteRow.vote || null,
        };

        if (data.courseId) {
            await publish(channels.course(data.courseId), events.COMMENT_VOTED, {
                commentId: data.commentId,
                upvotes: result.upvotes,
                downvotes: result.downvotes,
            });
        }

        return result;
    },

    deleteFavorite: async (data) => {
        const response = await courseDb.deleteFavorite(data);

        if (!response || response.rowCount === 0) {
            throw new Error('Failed to delete favorite status, try again later');
        }

        const deleted = response.rows[0];

        await afterProgressChange({ userId: data.userId, courseId: data.courseId, reason: progressReasons.FAVORITE_CHANGED });

        return !!deleted;
    },
}