/**
 * Channel and event names shared by the Pusher server triggers and the browser subscriptions.
 * Keep this file isomorphic (no Node or browser-only imports).
 *
 * - `course-{courseId}`        public: discussion feed of a course
 * - `private-user-{publicId}`  private: events for one signed-in user (auth via /api/pusher/auth)
 */

export const channels = {
    course: (courseId) => `course-${courseId}`,
    user: (userId) => `private-user-${userId}`,
};

export const USER_CHANNEL_PREFIX = "private-user-";

export const events = {
    // course channel
    COMMENT_CREATED: "new-comment",
    COMMENT_VOTED: "comment-voted",

    // user channel
    SESSION_REVOKED: "session-revoked",
    PROGRESS_UPDATED: "progress-updated",
    CHALLENGE_SUBMITTED: "challenge-submitted",
    PROFILE_UPDATED: "profile-updated",
};

/** Reasons sent with PROGRESS_UPDATED so the client can pick what to refetch. */
export const progressReasons = {
    REGISTERED: "registered",
    WITHDRAWN: "withdrawn",
    LESSON_COMPLETED: "lesson-completed",
    FAVORITE_CHANGED: "favorite-changed",
    // A course was bought, redeemed, refunded or granted: entitlements / wallet / orders changed.
    OWNERSHIP_CHANGED: "ownership-changed",
};
