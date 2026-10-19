"use client";

import { markSigningOut } from "@/lib/authSignal";
import { disconnectPusher } from "@/lib/pusherClient";
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

function dropClientState(queryClient) {
    markSigningOut();
    if (queryClient) {
        queryClient.cancelQueries().catch(() => { });
        queryClient.clear();
    }
    disconnectPusher();
    resetAuthRefreshState();
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
    window.location.replace(target);
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
