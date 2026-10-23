import { sessionDb } from "@/db/session.db";
import { emailTokenDb } from "@/db/emailToken.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { AUTH } from "@/lib/authConfig";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";

/**
 * Transactional outbox for auth side effects.
 *
 * Revocations write their event in the same PostgreSQL transaction as the revoke itself. After
 * the commit the caller processes it right away; if that fails (Redis down, process crash) the
 * worker below, or the cron endpoint, retries with exponential backoff until it succeeds.
 *
 * Consistency limit: until an event is processed, Redis may still say "active" for a revoked
 * session. Session cache entries live at most AUTH_SESSION_CACHE_MAX_TTL_SECONDS, so even if
 * Redis stays unreachable for writes a revocation is enforced within that bound.
 */

const WORKER_INTERVAL_MS = 15_000;
const CLEANUP_INTERVAL_MS = 10 * 60_000;
const MAX_BACKOFF_SEC = 300;

const handlers = {
    // Imported lazily: emailVerification.service imports this module to process its event.
    "email.verify_requested": async (payload) => {
        const { emailVerificationService } = await import("@/services/emailVerification.service");
        await emailVerificationService.send(payload.userId);
    },

    "email.link_requested": async (payload) => {
        const { accountLinkService } = await import("@/services/accountLink.service");
        await accountLinkService.sendLinkEmail(payload);
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
export async function processAuthOutbox({ ids = null, limit = 50 } = {}) {
    let rows = [];
    try {
        rows = await sessionDb.claimOutbox({ ids, limit });
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
            console.warn(`[auth-outbox] event ${row.id} (${row.event_type}) failed, retry in ${retryInSec}s:`, error?.message);
            await sessionDb.failOutbox({ id: row.id, error: error?.message, retryInSec }).catch(() => { });
        }
    }

    return { processed, failed };
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
 * In-process retry loop for long-running Node servers (`next start`, `next dev`, Docker).
 * Serverless deployments should call POST /api/internal/auth-outbox from a scheduler instead.
 */
export function ensureAuthOutboxWorker() {
    if (typeof window !== "undefined" || process.env.AUTH_OUTBOX_WORKER === "off") return;
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
            }
        } finally {
            state.running = false;
        }
    };

    const timer = setInterval(tick, WORKER_INTERVAL_MS);
    timer.unref?.();
}
