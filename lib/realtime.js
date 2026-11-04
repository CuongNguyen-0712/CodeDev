/**
 * Channel and event names shared by the Pusher server triggers and the browser subscriptions.
 * Keep this file isomorphic (no Node or browser-only imports).
 *
 * - `course-{courseId}`        public: discussion feed of a course
 * - `private-user-{publicId}`  private: events for one signed-in user (auth via /api/pusher/auth)
 * - `broadcast`                public: "refetch your inbox" pings for admin announcements (payload { id } only)
 */

export const channels = {
    course: (courseId) => `course-${courseId}`,
    user: (userId) => `private-user-${userId}`,
    broadcast: () => "broadcast",
};

export const USER_CHANNEL_PREFIX = "private-user-";

export const events = {
    // course channel
    COMMENT_CREATED: "new-comment",
    COMMENT_VOTED: "comment-voted",

    // broadcast channel: an announcement reached (or was retracted from) many inboxes
    ANNOUNCEMENT: "announcement",

    // user channel
    SESSION_REVOKED: "session-revoked",
    PROGRESS_UPDATED: "progress-updated",
    CHALLENGE_SUBMITTED: "challenge-submitted",
    PROFILE_UPDATED: "profile-updated",
    // A notification row was written for this user: { id, kind }; the row itself is fetched over HTTP.
    NOTIFICATION_CREATED: "notification-created",
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
