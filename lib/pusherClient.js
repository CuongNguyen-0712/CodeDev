import PusherClient from "pusher-js";

import { setRealtimeDisconnect } from "@/lib/authNavigation";
import { fetchWithAuthRetry, onAuthEvent } from "@/lib/authRefresh";

let pusherClientInstance = null;
let stopAuthListener = null;

// pusher-js posts to its endpoint with its own ajax, which skips the expired-access refresh that
// axios does: a tab reopened after idle would get 401 and never subscribe. This handler sends the
// same form data through fetchWithAuthRetry instead. pusher-js reports a plain Error as
// `{ type: "AuthError", error: message }` (the status is in the message, not a field).
async function authorizeChannel({ socketId, channelName }, callback) {
    let error = null;
    let data = null;
    try {
        const response = await fetchWithAuthRetry("/api/pusher/auth", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }),
        });
        if (response.ok) {
            data = await response.json();
        } else {
            error = new Error(`Channel authorization failed (${response.status})`);
            error.status = response.status;
            if (isTransient(response.status)) retryLater(channelName, Number(response.headers?.get?.("retry-after")) || 0);
        }
    } catch (failure) {
        // Network error, timeout, unreadable body: worth another try.
        error = failure;
        retryLater(channelName, 0);
    }
    if (!error) transientFailures.delete(channelName);
    // Once, outside the try: a listener throwing behind the callback must not get a second call.
    callback(error, data);
}

// 401 and 403 are final (signed out, wrong channel, an expired access the refresh could not fix
// waits for `refreshed`); rate limits, server errors and network errors are retried with backoff.
const isTransient = (status) => status === 408 || status === 429 || status >= 500;
const TRANSIENT_RETRY_BASE_MS = 10_000;
const TRANSIENT_RETRY_MAX_MS = 5 * 60_000;
const transientFailures = new Map();
const retryTimers = new Map();

function retryLater(channelName, retryAfterSec) {
    if (retryTimers.has(channelName)) return;
    const failures = (transientFailures.get(channelName) || 0) + 1;
    transientFailures.set(channelName, failures);
    const delay = retryAfterSec > 0
        ? retryAfterSec * 1000
        : Math.min(TRANSIENT_RETRY_BASE_MS * 2 ** (failures - 1), TRANSIENT_RETRY_MAX_MS);
    retryTimers.set(channelName, setTimeout(() => {
        retryTimers.delete(channelName);
        const pusher = pusherClientInstance;
        if (pusher && channelRefs.has(channelName) && isFailed(pusher.channel(channelName))) {
            pusher.subscribe(channelName);
        }
    }, delay));
}

function dropRetry(channelName) {
    clearTimeout(retryTimers.get(channelName));
    retryTimers.delete(channelName);
    transientFailures.delete(channelName);
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

// Once a minute per channel at most: two tabs whose refreshed session still answers
// ACCESS_TOKEN_EXPIRED would otherwise set off each other's refresh + resubscribe without end.
const RESUBSCRIBE_COOLDOWN_MS = 60_000;
const lastResubscribeAt = new Map();

function resubscribeFailed() {
    const pusher = pusherClientInstance;
    if (!pusher) return;
    const now = Date.now();
    for (const channelName of channelRefs.keys()) {
        if (!isFailed(pusher.channel(channelName))) continue;
        if (now - (lastResubscribeAt.get(channelName) || 0) < RESUBSCRIBE_COOLDOWN_MS) continue;
        lastResubscribeAt.set(channelName, now);
        pusher.subscribe(channelName);
    }
}

export function acquireChannel(channelName) {
    const pusher = getPusherClient();
    if (!pusher || !channelName) return null;

    channelRefs.set(channelName, (channelRefs.get(channelName) || 0) + 1);
    // pusher.subscribe is idempotent for a subscribed or pending channel, sends a new subscribe
    // for a failed one, and reinstates one whose unsubscribe is still pending.
    return pusher.subscribe(channelName);
}

export function releaseChannel(channelName) {
    // The existing client only: a component unmounting after sign out must not open a new socket.
    const pusher = pusherClientInstance;
    if (!pusher || !channelName) return;

    const remaining = (channelRefs.get(channelName) || 1) - 1;
    if (remaining > 0) {
        channelRefs.set(channelName, remaining);
        return;
    }

    channelRefs.delete(channelName);
    dropRetry(channelName);
    pusher.unsubscribe(channelName);
}

/** Drops every subscription and the socket (used on sign out). */
export function disconnectPusher() {
    if (!pusherClientInstance) return;
    stopAuthListener?.();
    stopAuthListener = null;
    for (const channelName of [...retryTimers.keys()]) dropRetry(channelName);
    transientFailures.clear();
    channelRefs.clear();
    lastResubscribeAt.clear();
    pusherClientInstance.disconnect();
    pusherClientInstance = null;
}
