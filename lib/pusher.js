import PusherServer from "pusher";

import { channels } from "@/lib/realtime";

const MAX_PAYLOAD_BYTES = 9_500; // Pusher rejects events over 10KB
const TRIGGER_TIMEOUT_MS = 3_000;

// ------------------------------------------------------------------ server

let pusherServerInstance = null;
let warnedMissingServer = false;

export const getPusherServer = () => {
    if (typeof window !== "undefined") {
        throw new Error("getPusherServer can only be called on the server side.");
    }

    if (!pusherServerInstance) {
        const appId = process.env.PUSHER_APP_ID || process.env.PUSH_APP;
        const key = process.env.PUSHER_KEY;
        const secret = process.env.PUSHER_SECRET;
        const cluster = process.env.PUSHER_CLUSTER || "ap1";

        if (!appId || !key || !secret) {
            if (!warnedMissingServer) {
                console.warn("[Pusher Server] Missing credentials (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET). Realtime triggers are skipped.");
                warnedMissingServer = true;
            }
            return null;
        }

        pusherServerInstance = new PusherServer({
            appId,
            key,
            secret,
            cluster,
            useTLS: true,
            timeout: TRIGGER_TIMEOUT_MS,
        });
    }

    return pusherServerInstance;
};

/**
 * Fire-and-forget broadcast. Never throws: realtime is an enhancement, the write that
 * triggered it has already succeeded. Oversized payloads are replaced by a `{ stale: true }`
 * hint so clients refetch instead.
 *
 * @param {string|string[]} channel
 * @param {string} event
 * @param {object} data
 * @param {{ socketId?: string }} [options] - excludes the sender's own connection
 */
export async function publish(channel, event, data = {}, { socketId } = {}) {
    const pusher = getPusherServer();
    if (!pusher || !channel) return false;

    let payload = data ?? {};
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES) {
        console.warn(`[Pusher] Payload for "${event}" exceeds ${MAX_PAYLOAD_BYTES} bytes, sending refetch hint.`);
        payload = { stale: true };
    }

    try {
        await pusher.trigger(channel, event, payload, socketId ? { socket_id: socketId } : undefined);
        return true;
    } catch (error) {
        console.error(`[Pusher] Failed to publish "${event}" on ${[].concat(channel).join(",")}:`, error?.message);
        return false;
    }
}

/** Publishes to the private channel of one user (public id). */
export function publishToUser(userId, event, data = {}) {
    if (!userId) return Promise.resolve(false);
    return publish(channels.user(userId), event, { ...data, at: Date.now() });
}
