import PusherServer from "pusher";
import PusherClient from "pusher-js";

// Server instance (only instantiated in Node environment)
let pusherServerInstance = null;

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
            console.warn("[Pusher Server] Missing credentials (PUSHER_APP_ID/PUSH_APP, PUSHER_KEY, PUSHER_SECRET). Realtime trigger will be skipped.");
            return null;
        }

        pusherServerInstance = new PusherServer({
            appId,
            key,
            secret,
            cluster,
            useTLS: true,
        });
    }

    return pusherServerInstance;
};

// Client instance (singleton for browser)
let pusherClientInstance = null;

export const getPusherClient = () => {
    if (typeof window === "undefined") {
        return null;
    }

    if (!pusherClientInstance) {
        const key = process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY;
        const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || process.env.PUSHER_CLUSTER || "ap1";

        if (!key) {
            console.warn("[Pusher Client] Missing Pusher Key. Realtime subscriptions will be disabled.");
            return null;
        }

        pusherClientInstance = new PusherClient(key, {
            cluster,
            forceTLS: true,
        });
    }

    return pusherClientInstance;
};
