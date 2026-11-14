import PusherClient from "pusher-js";

import { setRealtimeDisconnect } from "@/lib/authNavigation";
import { fetchWithAuthRetry, onAuthEvent } from "@/lib/authRefresh";

let pusherClientInstance = null;
let stopAuthListener = null;

// pusher-js posts to its endpoint with its own ajax, which skips the expired-access refresh that
// axios does: a tab reopened after idle would get 401 and never subscribe. This handler sends the
// same form data through fetchWithAuthRetry instead.
async function authorizeChannel({ socketId, channelName }, callback) {
    try {
        const response = await fetchWithAuthRetry("/api/pusher/auth", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }),
        });
        if (!response.ok) {
            const error = new Error(`Channel authorization failed (${response.status})`);
            error.status = response.status;
            callback(error, null);
            return;
        }
        callback(null, await response.json());
    } catch (error) {
        callback(error, null);
    }
}

export const getPusherClient = () => {
    if (typeof window === "undefined") {
        return null;
    }

    if (!pusherClientInstance) {
        const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
        const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1";

        if (!key) {
            console.warn("[Pusher Client] NEXT_PUBLIC_PUSHER_KEY is not set. Realtime subscriptions are disabled.");
            return null;
        }

        pusherClientInstance = new PusherClient(key, {
            cluster,
            forceTLS: true,
            // Private channels (private-user-*) are authorized by our own endpoint, through
            // authorizeChannel so an expired access state is refreshed first.
            channelAuthorization: { customHandler: authorizeChannel },
            activityTimeout: 60_000,
            pongTimeout: 15_000,
        });

        // Signing out drops the socket and its subscriptions (see lib/authNavigation).
        setRealtimeDisconnect(disconnectPusher);

        // A subscribe that failed before its auth could recover gets another try once the
        // session is refreshed (in this tab or another).
        stopAuthListener = onAuthEvent((message) => {
            if (message?.type === "refreshed") resubscribeFailed();
        });

        if (process.env.NODE_ENV !== "production") {
            pusherClientInstance.connection.bind("state_change", ({ previous, current }) => {
                console.debug(`[Pusher Client] ${previous} -> ${current}`);
            });
        }
    }

    return pusherClientInstance;
};

// No side effects: never creates or reopens a client.
export const isPusherConnected = () => pusherClientInstance?.connection?.state === "connected";

// Several components may share one channel: only unsubscribe when the last one leaves.
const channelRefs = new Map();

// Neither subscribed nor waiting for an answer: its last subscribe failed (e.g. auth 401).
const isFailed = (channel) => Boolean(channel) && !channel.subscribed && !channel.subscriptionPending;

function resubscribeFailed() {
    const pusher = pusherClientInstance;
    if (!pusher) return;
    for (const channelName of channelRefs.keys()) {
        if (isFailed(pusher.channel(channelName))) pusher.subscribe(channelName);
    }
}

export function acquireChannel(channelName) {
    const pusher = getPusherClient();
    if (!pusher || !channelName) return null;

    channelRefs.set(channelName, (channelRefs.get(channelName) || 0) + 1);
    const existing = pusher.channel(channelName);
    // pusher.subscribe on a failed channel sends a new subscribe for it.
    if (existing && !isFailed(existing)) return existing;
    return pusher.subscribe(channelName);
}

export function releaseChannel(channelName) {
    const pusher = getPusherClient();
    if (!pusher || !channelName) return;

    const remaining = (channelRefs.get(channelName) || 1) - 1;
    if (remaining > 0) {
        channelRefs.set(channelName, remaining);
        return;
    }

    channelRefs.delete(channelName);
    pusher.unsubscribe(channelName);
}

/** Drops every subscription and the socket (used on sign out). */
export function disconnectPusher() {
    if (!pusherClientInstance) return;
    stopAuthListener?.();
    stopAuthListener = null;
    channelRefs.clear();
    pusherClientInstance.disconnect();
    pusherClientInstance = null;
}
