import { NonRetriableError, RetryAfterError } from "inngest";

import { sessionDb } from "@/db/session.db";
import { emailTokenDb } from "@/db/emailToken.db";
import { deadLetterDb } from "@/db/deadLetter.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { AUTH } from "@/lib/authConfig";
import { inngest, outboxViaInngest } from "@/lib/inngest";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";

/**
 * Transactional outbox for auth side effects.
 *
 * Every event is written in the same PostgreSQL transaction as the change it reports. After the
 * commit the caller calls dispatchAuthOutbox():
 *   - with Inngest (lib/inngest.js): one `outbox/created` event per row, delivered by the
 *     outbox-deliver function (retries, SMTP throttle, dead letters); the sweeper re-sends rows
 *     whose event never went out. session.revoked still runs inline first: it is a fast Redis
 *     write that should not wait for a queue.
 *   - without Inngest: processed inline; the in-process worker below retries failures with
 *     exponential backoff, up to max_attempts, then marks the event dead.
 *
 * Consistency limit: until an event is processed, Redis may still say "active" for a revoked
 * session. Session cache entries live at most AUTH_SESSION_CACHE_MAX_TTL_SECONDS, so even if
 * Redis stays unreachable for writes a revocation is enforced within that bound.
 */

const WORKER_INTERVAL_MS = 15_000;
const CLEANUP_INTERVAL_MS = 10 * 60_000;
const MAX_BACKOFF_SEC = 300;
const INLINE_EVENTS = ["session.revoked"];

const handlers = {
    // Imported lazily: emailVerification.service imports this module to process its event.
    "email.verify_requested": async (payload) => {
        const { emailVerificationService } = await import("@/services/emailVerification.service");
        // `reminder: true` is the purge reminder queued before migration 20261026_003.
        const reminder = payload.reminder === true ? "purge" : payload.reminder || null;
        await emailVerificationService.send(payload.userId, { reminder });
    },

    "email.link_requested": async (payload) => {
        const { accountLinkService } = await import("@/services/accountLink.service");
        await accountLinkService.sendLinkEmail(payload);
    },

    // Files of a purged account (plan 11.2). Both deletes are idempotent, so a retry is safe.
    "storage.purge": async (payload) => {
        const { s3 } = await import("@/lib/s3");
        const { destroyAsset } = await import("@/lib/cloudinary");
        for (const file of payload.files || []) {
            if (file.provider === "cloudinary") await destroyAsset(file.key);
            else await s3.delete(file.key, file.bucket ? { bucket: file.bucket } : undefined);
        }
    },

    "email.account_notice": async (payload) => {
        const { accountLinkService } = await import("@/services/accountLink.service");
        await accountLinkService.sendNotice(payload);
    },

    "session.revoked": async (payload, { attempts }) => {
        for (const sessionId of payload.sessionIds || []) {
            // Overwrite (not delete) so a reader that fetched "active" just before the revoke
            // cannot repopulate it for longer than the marker's TTL.
            await redis.setOrThrow(
                cacheKeys.session(sessionId),
                { sessionId: String(sessionId), status: "inactive" },
                { ex: AUTH.SESSION_CACHE_MAX_TTL_SEC }
            );
        }

        // Realtime notice is best effort and sent once: the cache write is what must succeed.
        if (attempts === 1 && payload.userId) {
            publishToUser(payload.userId, events.SESSION_REVOKED, {
                sessionIds: payload.sessionIds || [],
                reason: payload.reason,
            });
        }
    },
};

/**
 * Processes due outbox events (optionally only `ids`). Never throws.
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processAuthOutbox({ ids = null, limit = 50, eventTypes = null } = {}) {
    let rows = [];
    try {
        rows = await sessionDb.claimOutbox({ ids, limit, eventTypes });
    } catch (error) {
        console.error("[auth-outbox] claim failed:", error?.message);
        return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const row of rows) {
        const handler = handlers[row.event_type];
        try {
            if (!handler) throw new Error(`No handler for ${row.event_type}`);
            await handler(row.payload || {}, { attempts: Number(row.attempts) || 1 });
            await sessionDb.completeOutbox({ id: row.id });
            processed += 1;
        } catch (error) {
            failed += 1;
            const retryInSec = Math.min(MAX_BACKOFF_SEC, 5 * 2 ** Math.min(Number(row.attempts) || 1, 6));
            const { dead } = await sessionDb.failOutbox({ id: row.id, error: error?.message, retryInSec }).catch(() => ({ dead: false }));
            if (dead) {
                console.error(`[auth-outbox] event ${row.id} (${row.event_type}) gave up after ${row.attempts} attempts:`, error?.message);
                await deadLetterDb.record({
                    source: "outbox", kind: row.event_type, ref: row.id, payload: row.payload, error: error?.message, attempts: Number(row.attempts),
                }).catch(() => { });
            } else {
                console.warn(`[auth-outbox] event ${row.id} (${row.event_type}) failed, retry in ${retryInSec}s:`, error?.message);
            }
        }
    }

    return { processed, failed };
}

/** Sends one `outbox/created` event per row; a failed send is picked up again by the sweeper. */
export async function publishAuthOutbox(ids) {
    if (!ids?.length) return;
    try {
        await inngest.send(ids.map((id) => ({ id: `outbox-${id}`, name: "outbox/created", data: { id: String(id) } })));
        await sessionDb.markOutboxPublished({ ids });
    } catch (error) {
        console.error("[auth-outbox] publish failed, the sweeper will retry:", error?.message);
    }
}

/** Call after the transaction that wrote `ids` has committed. Never throws. */
export async function dispatchAuthOutbox(ids) {
    if (!ids?.length) return;
    if (!outboxViaInngest()) {
        await processAuthOutbox({ ids, limit: ids.length });
        return;
    }
    await processAuthOutbox({ ids, limit: ids.length, eventTypes: INLINE_EVENTS });
    await publishAuthOutbox(ids);
}

/**
 * Delivers one event for the Inngest outbox-deliver function. Throws so Inngest retries; an event
 * that cannot succeed (no handler) throws NonRetriableError. Already processed or dead: no-op.
 */
export async function deliverAuthOutboxEvent(id) {
    const [row] = await sessionDb.claimOutbox({ ids: [id], limit: 1 });
    if (!row) {
        const state = await sessionDb.outboxState({ id });
        if (!state || state.processed_at || state.dead_at) return { status: state?.processed_at ? "processed" : "skipped" };
        // Leased by another delivery or backing off after an inline failure: come back then.
        throw new RetryAfterError("Outbox event is not due yet", new Date(state.available_at));
    }

    const handler = handlers[row.event_type];
    if (!handler) throw new NonRetriableError(`No handler for ${row.event_type}`);
    try {
        await handler(row.payload || {}, { attempts: Number(row.attempts) || 1 });
    } catch (error) {
        // Inngest owns the backoff: make the row claimable again right away.
        await sessionDb.failOutbox({ id: row.id, error: error?.message, retryInSec: 0 }).catch(() => { });
        throw error;
    }
    await sessionDb.completeOutbox({ id: row.id });
    return { status: "processed", eventType: row.event_type };
}

/** outbox-deliver ran out of retries: stop the row and keep a dead letter. */
export async function killAuthOutboxEvent(id, error) {
    await sessionDb.killOutbox({ id, error });
    const state = await sessionDb.outboxState({ id });
    await deadLetterDb.record({
        source: "outbox", kind: state?.event_type || "unknown", ref: id, payload: state?.payload ?? null,
        error, attempts: state?.attempts ?? null,
    });
}

export async function cleanupAuthState() {
    try {
        const state = await sessionDb.cleanup();
        return { ...state, emailTokensDeleted: await emailTokenDb.cleanup() };
    } catch (error) {
        console.error("[auth-outbox] cleanup failed:", error?.message);
        return null;
    }
}

/**
 * In-process retry loop for long-running Node servers (`next start`, `next dev`, Docker) while
 * Inngest is not configured. With Inngest, the outbox-deliver function and the sweeper do this.
 */
export function ensureAuthOutboxWorker() {
    if (typeof window !== "undefined" || process.env.AUTH_OUTBOX_WORKER === "off" || outboxViaInngest()) return;
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    const state = globalThis.__codedevAuthOutbox || (globalThis.__codedevAuthOutbox = { started: false, running: false });
    if (state.started) return;
    state.started = true;

    let lastCleanup = 0;
    const tick = async () => {
        if (state.running) return;
        state.running = true;
        try {
            await processAuthOutbox();
            if (Date.now() - lastCleanup > CLEANUP_INTERVAL_MS) {
                lastCleanup = Date.now();
                await cleanupAuthState();
                // Imported lazily: account maintenance imports this module.
                const { runAccountMaintenance } = await import("@/services/accountMaintenance.service");
                await runAccountMaintenance();
            }
        } finally {
            state.running = false;
        }
    };

    const timer = setInterval(tick, WORKER_INTERVAL_MS);
    timer.unref?.();
}
