import { notificationDb } from "@/db/notification.db";
import { parseUtcTimestamp } from "@/lib/db";
import { ApiError } from "@/lib/error/apiError";
import { pushToUsers } from "@/lib/beams";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";

/**
 * Notification inbox (docs/ui-ux/INFORMATION_ARCHITECTURE.md D-04): one row per durable event,
 * read state in the database, open tabs told over the user's private channel. Nothing is cached
 * in Redis. Toasts stay for the user's own immediate actions; this is the record.
 */

const PAGE = 20;

// Course kinds share the title lookup: producers only know ids.
const COURSE_COPY = {
    access_granted: (title) => ({ title: "Course unlocked", message: `You now have access to ${title}.` }),
    access_revoked: (title) => ({ title: "Course access removed", message: `Your access to ${title} was revoked.` }),
    course_completed: (title) => ({ title: "Course completed", message: `You finished ${title}. Rate it to help other learners.` }),
};

// Keyset cursor: (created_at, id) of the last row, created_at as the database's own text.
function encodeCursor(row) {
    return Buffer.from(JSON.stringify([row.created_at, row.id])).toString("base64url");
}

export function decodeNotificationCursor(raw) {
    if (!raw) return null;
    try {
        const [createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (/^\d{4}-\d{2}-\d{2}[ T][\d:.]{8,15}$/.test(createdAt) && /^[0-9a-f-]{36}$/i.test(id)) return { createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

function mapRow(row) {
    return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        message: row.message,
        link: row.link,
        read: Boolean(row.has_seen),
        // The database's naive UTC text becomes an ISO instant; the cursor keeps the raw text.
        createdAt: parseUtcTimestamp(row.created_at),
    };
}

export const notificationService = {
    /**
     * Inserts, then tells the user's open tabs. No row back means already notified: no event.
     * Best effort: the write that caused it has already succeeded, so a failure here is logged,
     * never surfaced to the user.
     */
    notify: async (userId, { kind, title, message, link = null, dedupeKey = null }) => {
        try {
            const { rows } = await notificationDb.insert({ userId, kind, title, message, link, dedupeKey });
            const row = rows[0] || null;
            if (row) {
                // Open tabs over Channels, closed ones over Beams web push; one failing never stops the other.
                await Promise.all([
                    publishToUser(userId, events.NOTIFICATION_CREATED, { id: row.id, kind: row.kind }),
                    pushToUsers([userId], { title, body: message, link }).catch((error) => {
                        console.error(`[notification] push ${kind} for ${userId} failed:`, error?.message);
                    }),
                ]);
            }
            return row;
        } catch (error) {
            console.error(`[notification] ${kind} for ${userId} failed:`, error?.message);
            return null;
        }
    },

    /** access_granted / access_revoked / course_completed for one course (public id). */
    notifyCourse: async (userId, kind, courseId, dedupeKey = courseId) => {
        const copy = COURSE_COPY[kind];
        if (!copy) throw new Error(`Unknown course notification kind: ${kind}`);
        const title = await notificationDb.courseTitle({ courseId }).then((r) => r.rows[0]?.title, () => null) || "a course";
        const link = kind === "access_revoked" ? "/orders" : `/course/${courseId}`;
        return notificationService.notify(userId, { kind, ...copy(title), link, dedupeKey });
    },

    /** Level-up and achievements out of a challenge or lesson reward ({ level, previousLevel, achievements }). */
    notifyRewards: async (userId, rewards = {}) => {
        const level = Number(rewards.level) || 0;
        if (level > (Number(rewards.previousLevel) || 0)) {
            await notificationService.notify(userId, {
                kind: "level_up",
                title: `Level ${level} reached`,
                message: "Keep solving challenges to climb further.",
                link: "/profile",
                dedupeKey: String(level),
            });
        }
        for (const a of rewards.achievements || []) {
            await notificationService.notify(userId, {
                kind: "achievement",
                title: "Achievement unlocked",
                message: a.title || a.code,
                link: "/profile",
                dedupeKey: a.code,
            });
        }
    },

    list: async ({ userId, unreadOnly = false, cursor = null }) => {
        const [{ rows }, count] = await Promise.all([
            notificationDb.list({ userId, unreadOnly, cursor, limit: PAGE }),
            notificationDb.unreadCount({ userId }),
        ]);
        const hasMore = rows.length > PAGE;
        const page = rows.slice(0, PAGE);
        return {
            items: page.map(mapRow),
            hasMore,
            nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
            unreadCount: count.rows[0]?.n ?? 0,
        };
    },

    markRead: async ({ userId, ids }) => {
        const res = await notificationDb.markRead({ userId, ids });
        return { updated: res.rowCount };
    },

    markAllRead: async ({ userId }) => {
        const res = await notificationDb.markAllRead({ userId });
        return { updated: res.rowCount };
    },

    dismiss: async ({ userId, ids }) => {
        const res = await notificationDb.dismiss({ userId, ids });
        return { updated: res.rowCount };
    },
};
