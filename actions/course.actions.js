'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { courseService } from "@/services/course.service";

async function getAuthUserId() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please sign in to proceed.");
    }
    return session.user.id;
}

function parseCourseId(courseIdOrData) {
    if (typeof courseIdOrData === 'object' && courseIdOrData !== null) {
        return courseIdOrData.courseId || courseIdOrData.id;
    }
    return courseIdOrData;
}

export async function submitLessonAction({ courseId, lessonId }) {
    const userId = await getAuthUserId();

    if (!courseId || !lessonId) {
        throw new Error("Course ID and Lesson ID are required.");
    }

    const success = await courseService.postSubmitLesson({ userId, courseId, lessonId });
    return { success: Boolean(success) };
}

export async function submitChallengeAction({ challengeId, answers }) {
    const userId = await getAuthUserId();

    if (!challengeId) {
        throw new Error("Challenge ID is required.");
    }

    const result = await courseService.postSubmitChallenge({
        userId,
        challengeId,
        answers: answers || {}
    });

    return JSON.parse(JSON.stringify(result || {}));
}

export async function registerCourseAction(courseIdOrData) {
    const userId = await getAuthUserId();
    const courseId = parseCourseId(courseIdOrData);

    if (!courseId) {
        throw new Error("Course ID is required.");
    }

    const success = await courseService.postRegister({ userId, courseId });
    return { success: Boolean(success) };
}

export async function withdrawCourseAction(courseIdOrData) {
    const userId = await getAuthUserId();
    const courseId = parseCourseId(courseIdOrData);

    if (!courseId) {
        throw new Error("Course ID is required.");
    }

    const response = await courseService.postWithdraw({ userId, courseId });
    return { success: Boolean(response) };
}

export async function favoriteCourseAction(courseIdOrData) {
    const userId = await getAuthUserId();
    const courseId = parseCourseId(courseIdOrData);

    if (!courseId) {
        throw new Error("Course ID is required.");
    }

    const response = await courseService.postFavorite({ userId, courseId });
    return { success: Boolean(response) };
}

export async function unfavoriteCourseAction(courseIdOrData) {
    const userId = await getAuthUserId();
    const courseId = parseCourseId(courseIdOrData);

    if (!courseId) {
        throw new Error("Course ID is required.");
    }

    const response = await courseService.deleteFavorite({ userId, courseId });
    return { success: Boolean(response) };
}

export async function postCommentAction({ courseId, content }) {
    const userId = await getAuthUserId();

    if (!courseId || !content?.trim()) {
        throw new Error("Course ID and comment content are required.");
    }

    const success = await courseService.postComment({ userId, courseId, content: content.trim() });
    return { success: Boolean(success) };
}

export async function voteCommentAction({ commentId, vote }) {
    const userId = await getAuthUserId();

    if (!commentId) {
        throw new Error("Comment ID is required.");
    }

    const response = await courseService.postVotingComment({ userId, commentId, vote });
    return { success: Boolean(response) };
}
