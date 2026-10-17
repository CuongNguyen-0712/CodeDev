'use server';

import { courseService } from "@/services/course.service";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

const MAX_COMMENT_LENGTH = 200;

function parseCourseId(courseIdOrData) {
    const courseId = typeof courseIdOrData === 'object' && courseIdOrData !== null
        ? courseIdOrData.courseId || courseIdOrData.id
        : courseIdOrData;

    if (!courseId) {
        throw new ApiError("Course ID is required.", 400);
    }

    return String(courseId);
}

// Called whenever the learner opens a lesson: keeps the course history (resume point) current.
export async function recordLessonVisitAction({ courseId, lessonId } = {}) {
    return runAction(async ({ userId }) => {
        if (!courseId || !/^\d{1,19}$/.test(String(lessonId || ""))) {
            throw new ApiError("Course ID and Lesson ID are required.", 400);
        }

        return courseService.recordLessonVisit({ userId, courseId: String(courseId), lessonId: String(lessonId) });
    }, { limiter: rateLimiters.api, context: "recordLessonVisitAction" });
}

export async function submitLessonAction({ courseId, lessonId } = {}) {
    return runAction(async ({ userId }) => {
        if (!courseId || !lessonId) {
            throw new ApiError("Course ID and Lesson ID are required.", 400);
        }

        const success = await courseService.postSubmitLesson({ userId, courseId, lessonId });
        return Boolean(success);
    }, { context: "submitLessonAction" });
}

export async function registerCourseAction(courseIdOrData) {
    return runAction(async ({ userId }) => {
        const success = await courseService.postRegister({ userId, courseId: parseCourseId(courseIdOrData) });
        return Boolean(success);
    }, { context: "registerCourseAction" });
}

export async function withdrawCourseAction(courseIdOrData) {
    return runAction(async ({ userId }) => {
        const success = await courseService.postWithdraw({ userId, courseId: parseCourseId(courseIdOrData) });
        return Boolean(success);
    }, { context: "withdrawCourseAction" });
}

export async function favoriteCourseAction(courseIdOrData) {
    return runAction(async ({ userId }) => {
        const success = await courseService.postFavorite({ userId, courseId: parseCourseId(courseIdOrData) });
        return Boolean(success);
    }, { context: "favoriteCourseAction" });
}

export async function unfavoriteCourseAction(courseIdOrData) {
    return runAction(async ({ userId }) => {
        const success = await courseService.deleteFavorite({ userId, courseId: parseCourseId(courseIdOrData) });
        return Boolean(success);
    }, { context: "unfavoriteCourseAction" });
}

export async function postCommentAction({ courseId, content } = {}) {
    return runAction(async ({ userId }) => {
        const trimmed = String(content || "").trim();

        if (!courseId || !trimmed) {
            throw new ApiError("Course ID and comment content are required.", 400);
        }

        if (trimmed.length > MAX_COMMENT_LENGTH) {
            throw new ApiError(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`, 400);
        }

        const result = await courseService.postComment({ userId, courseId, content: trimmed });
        return typeof result === 'object' ? result : null;
    }, { limiter: rateLimiters.comment, context: "postCommentAction" });
}

export async function voteCommentAction({ commentId, courseId, vote } = {}) {
    return runAction(async ({ userId }) => {
        if (!commentId) {
            throw new ApiError("Comment ID is required.", 400);
        }

        const response = await courseService.postVotingComment({ userId, commentId, courseId, vote });
        return typeof response === 'object' ? response : null;
    }, { limiter: rateLimiters.vote, context: "voteCommentAction" });
}
