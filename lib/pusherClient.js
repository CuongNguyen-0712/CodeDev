import PusherClient from "pusher-js";

let pusherClientInstance = null;

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
            // Private channels (private-user-*) are authorized by our own endpoint.
            channelAuthorization: {
                endpoint: "/api/pusher/auth",
                transport: "ajax",
            },
            activityTimeout: 60_000,
            pongTimeout: 15_000,
        });

        if (process.env.NODE_ENV !== "production") {
            pusherClientInstance.connection.bind("state_change", ({ previous, current }) => {
                console.debug(`[Pusher Client] ${previous} -> ${current}`);
            });
        }
    }

    return pusherClientInstance;
};

// Several components may share one channel: only unsubscribe when the last one leaves.
const channelRefs = new Map();

export function acquireChannel(channelName) {
    const pusher = getPusherClient();
    if (!pusher || !channelName) return null;

    channelRefs.set(channelName, (channelRefs.get(channelName) || 0) + 1);
    return pusher.channel(channelName) || pusher.subscribe(channelName);
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
    channelRefs.clear();
    pusherClientInstance.disconnect();
    pusherClientInstance = null;
}
