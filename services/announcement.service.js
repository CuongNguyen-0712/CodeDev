import { adminDb } from "@/db/admin.db";
import { announcementDb } from "@/db/announcement.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { inngest, inngestEnabled } from "@/lib/inngest";
import { publish, publishToUser } from "@/lib/pusher";
import { channels, events } from "@/lib/realtime";

/**
 * Notifications sent by admins (docs/notification-plan.md 3): to everyone, by role, to the learners
 * of a course, or to named users (a direct message is the one-user case). Each send is written
 * once to ops.announcement and copied into every recipient's inbox in batches, through Inngest
 * (`announcement/send`) or inline when the queue is off. Sends, cancels and retractions are audited.
 */

export const BATCH = 1000;
const MAX_BATCHES = 1000;
const MAX_SCHEDULE_DAYS = 30;
// Direct pings per user only for small audiences; everyone else refetches on the broadcast channel.
const DIRECT_PING_MAX = 100;
const PAGE = 30;

const encodeCursor = (row) => Buffer.from(JSON.stringify([row.cursor_at, row.id])).toString("base64url");

export function decodeAnnouncementCursor(raw) {
    if (!raw) return null;
    try {
        const [createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (/^\d{4}-\d{2}-\d{2}[ T][\d:.+-]{8,22}$/.test(createdAt) && /^[0-9a-f-]{36}$/i.test(id)) return { createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

function view(row) {
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        link: row.link,
        audience: row.audience,
        status: row.status,
        sendAt: row.send_at,
        sentAt: row.sent_at,
        recipients: row.recipients,
        readCount: row.read_count ?? null,
        createdBy: row.created_by ?? null,
        createdAt: row.created_at,
    };
}

/** Checks what the audience names and returns it in stored form (users as public ids). */
async function normalizeAudience(audience) {
    if (audience.type === "course" && !(await announcementDb.courseExists(audience.courseId))) {
        throw new ApiError("Course not found", 404);
    }
    if (audience.type !== "users") return audience;

    const wanted = [...new Set(audience.userIds)];
    const { rows } = await announcementDb.resolveUsers(wanted);
    const found = new Set(rows.flatMap((row) => [row.public_id, row.username]));
    const unknown = wanted.filter((id) => !found.has(id));
    if (unknown.length) {
        throw new ApiError(`No active account for: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`, 422, {
            code: "UNKNOWN_USERS", details: { unknown },
        });
    }
    return { type: "users", userIds: [...new Set(rows.map((row) => row.public_id))] };
}

/** Tells open tabs to refetch: a ping per user for small lists, else one broadcast. */
function pingRecipients(announcement) {
    const audience = announcement.audience;
    if (audience?.type === "users" && audience.userIds.length <= DIRECT_PING_MAX) {
        for (const userId of audience.userIds) {
            publishToUser(userId, events.NOTIFICATION_CREATED, { id: announcement.id, kind: "announcement" });
        }
        return;
    }
    publish(channels.broadcast(), events.ANNOUNCEMENT, { id: announcement.id });
}

/** Queues the send (Inngest dedupes the event id), or runs it now when the queue is off. */
async function dispatch(row, { scheduled }) {
    if (!inngestEnabled()) {
        await announcementService.deliver(row.id);
        return;
    }
    try {
        await inngest.send({
            id: `announcement-${row.id}`,
            name: "announcement/send",
            data: { id: row.id, sendAt: scheduled ? new Date(row.send_at).toISOString() : null },
        });
    } catch (error) {
        // The hourly sweeper sends overdue announcements again.
        console.error("[announcement] queue send failed, the sweeper will retry:", row.id, error?.message);
    }
}

export const announcementService = {
    /** How many active learners an audience reaches; unknown users fail with their names. */
    preview: async ({ audience }) => {
        const normalized = await normalizeAudience(audience);
        return { recipients: await announcementDb.countAudience(normalized) };
    },

    create: async ({ actor, input, ip = null }) => {
        const audience = await normalizeAudience(input.audience);
        const recipients = await announcementDb.countAudience(audience);
        if (recipients === 0) throw new ApiError("No active learner matches this audience.", 422, { code: "EMPTY_AUDIENCE" });

        const sendAt = input.sendAt ? new Date(input.sendAt) : null;
        const scheduled = Boolean(sendAt && sendAt.getTime() > Date.now() + 60_000);
        if (scheduled && sendAt.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) {
            throw new ApiError(`Schedule at most ${MAX_SCHEDULE_DAYS} days ahead.`, 422);
        }
        if (scheduled && !inngestEnabled()) {
            throw new ApiError("Scheduling needs the background queue, which is off here. Send it now instead.", 422, { code: "QUEUE_OFF" });
        }

        const row = await withTransaction(async (client) => {
            const created = await announcementDb.create(client, {
                title: input.title,
                body: input.body,
                link: input.link || null,
                audience,
                sendAt: scheduled ? sendAt.toISOString() : null,
                createdBy: actor.id,
            });
            await adminDb.audit(client, {
                actorId: actor.id,
                action: scheduled ? "announcement.schedule" : "announcement.send",
                targetType: "announcement",
                targetId: created.id,
                after: { title: input.title, audience, recipients, sendAt: scheduled ? sendAt.toISOString() : null },
                ip,
            });
            return created;
        });

        await dispatch(row, { scheduled });
        return view((await announcementDb.get(row.id)) || row);
    },

    /** The whole send: start, every batch, finish. Inline mode and tests; the Inngest job runs the same steps. */
    deliver: async (id) => {
        const announcement = await announcementDb.startSending(id);
        if (!announcement) return null;
        let afterId = "0";
        for (let i = 0; i < MAX_BATCHES; i++) {
            const batch = await announcementDb.deliverBatch({ announcement, afterId, limit: BATCH });
            afterId = batch.lastId;
            if (batch.selected < BATCH) break;
        }
        return announcementService.finish(id);
    },

    startSending: (id) => announcementDb.startSending(id),
    deliverBatch: (announcement, afterId) => announcementDb.deliverBatch({ announcement, afterId, limit: BATCH }),

    finish: async (id) => {
        const done = await announcementDb.finishSending(id);
        if (done) pingRecipients(done);
        return done ? { id: done.id, recipients: done.recipients } : null;
    },

    cancel: async ({ actor, id, ip = null }) => {
        await withTransaction(async (client) => {
            const row = await announcementDb.transition(client, { id, from: ["scheduled"], to: "cancelled" });
            if (!row) throw new ApiError("Only a scheduled announcement that has not started can be cancelled.", 409, { code: "NOT_SCHEDULED" });
            await adminDb.audit(client, { actorId: actor.id, action: "announcement.cancel", targetType: "announcement", targetId: id, ip });
        });
        return view(await announcementDb.get(id));
    },

    /** Removes a sent announcement from every inbox (a correction is a new send). */
    retract: async ({ actor, id, reason, ip = null }) => {
        const row = await withTransaction(async (client) => {
            const changed = await announcementDb.transition(client, { id, from: ["sent"], to: "retracted" });
            if (!changed) throw new ApiError("Only a sent announcement can be retracted.", 409, { code: "NOT_SENT" });
            const copies = await announcementDb.retractCopies(client, id);
            await adminDb.audit(client, {
                actorId: actor.id, action: "announcement.retract", targetType: "announcement", targetId: id,
                reason, after: { removed: copies.rowCount }, ip,
            });
            return changed;
        });
        pingRecipients(row);
        return view(await announcementDb.get(id));
    },

    list: async ({ cursor = null }) => {
        const { rows } = await announcementDb.list({ cursor, limit: PAGE });
        const items = rows.slice(0, PAGE);
        return {
            items: items.map(view),
            nextCursor: rows.length > PAGE ? encodeCursor(items[items.length - 1]) : null,
            queue: inngestEnabled(),
        };
    },

    /** Sweeper: due scheduled sends whose event never went out are queued again (same event id). */
    sweepOverdue: async () => {
        if (!inngestEnabled()) return 0;
        const { rows } = await announcementDb.listOverdue();
        if (rows.length) {
            await inngest.send(rows.map((row) => ({ id: `announcement-${row.id}`, name: "announcement/send", data: { id: row.id, sendAt: null } })));
        }
        return rows.length;
    },
};
