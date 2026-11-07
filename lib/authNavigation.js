"use client";

import { markSigningOut } from "@/lib/authSignal";
import { resetAuthRefreshState } from "@/lib/authRefresh";

/**
 * Leaving or entering a signed-in state always ends with a full page load (location.replace):
 *   - the Next.js client Router Cache still holds pages and redirects resolved for the previous
 *     user (e.g. `/` -> `/home` prefetched while signed in), so a client-side navigation can land
 *     back on a cached /home;
 *   - React Query, Pusher and the refresh scheduler hold the previous user's data and timers.
 * A document load drops all of it and lets the proxy decide the route with the new cookies.
 * `replace` also removes the signed-in page from history, so Back does not return to it.
 */

export const LANDING_PATH = "/";
export const HOME_PATH = "/home";

const NOTICE_KEY = "cd:auth-notice";

// lib/pusherClient registers its disconnect here once a socket exists, so this module (on every
// page) does not pull pusher-js into pages that never open one.
let disconnectRealtime = null;
export function setRealtimeDisconnect(fn) {
    disconnectRealtime = fn;
}

// lib/beamsClient registers its stop here once the Beams SDK is loaded, for the same reason.
let stopWebPush = null;
export function setWebPushStop(fn) {
    stopWebPush = fn;
}

function dropClientState(queryClient) {
    markSigningOut();
    if (queryClient) {
        queryClient.cancelQueries().catch(() => { });
        queryClient.clear();
    }
    disconnectRealtime?.();
    resetAuthRefreshState();
}

const WEB_PUSH_STOP_WAIT_MS = 1_500;

// Waits (briefly) for web push to unbind this device, so the next person on a shared computer
// does not get the previous user's notifications. Without a loaded SDK it leaves at once; if the
// wait runs out, the next signed-out page load unbinds (resumeWebPush(null) in sessionWatcher).
function afterWebPushStop(leave) {
    const pending = stopWebPush?.();
    if (!pending) return leave();
    const timeout = new Promise((resolve) => setTimeout(resolve, WEB_PUSH_STOP_WAIT_MS));
    Promise.race([pending, timeout]).catch(() => { }).finally(leave);
}

/** Signed out (this tab, another tab, or the server): forget the user and load `target`. */
export function leaveSignedOut(queryClient, { target = LANDING_PATH, notice = null } = {}) {
    dropClientState(queryClient);
    if (notice) {
        try {
            sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
        } catch {
            // Storage unavailable (private mode): the notice is optional.
        }
    }
    afterWebPushStop(() => window.location.replace(target));
}

/** Signed in: drop guest-state caches and load `target` with the new session cookies. */
export function enterSignedIn(queryClient, target = HOME_PATH) {
    queryClient?.clear();
    resetAuthRefreshState();
    markSigningOut(false);
    window.location.replace(target);
}

/** One-shot message left by leaveSignedOut for the next page (e.g. "server not reachable"). */
export function takeAuthNotice() {
    try {
        const raw = sessionStorage.getItem(NOTICE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(NOTICE_KEY);
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
