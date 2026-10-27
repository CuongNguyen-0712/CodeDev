"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import { useQueryClient } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { SESSION_ERROR, isFatalSessionError } from "@/constants/auth";
import { isSigningOut, markSigningOut } from "@/lib/authSignal";
import { LANDING_PATH, leaveSignedOut, takeAuthNotice } from "@/lib/authNavigation";
import {
    REFRESH_MARGIN_MS,
    getKnownAccessExpiry,
    onAuthEvent,
    refreshSession,
    setKnownAccessExpiry,
} from "@/lib/authRefresh";

import { UserRealtimeBridge } from "@/components/realtime/userRealtimeBridge";

/**
 * Client side of the session lifecycle:
 *   - refreshes the access state shortly before it expires, only while the tab is visible
 *     (hidden tabs refresh on demand when a request gets 401 ACCESS_TOKEN_EXPIRED);
 *   - signs the browser out when the server reports the session as revoked / expired / invalid
 *     (`session.error`) or when any tab's refresh failed for good;
 *   - follows a logout made in another tab, a session that disappeared (cookie cleared,
 *     next-auth broadcast) and pages restored from the back/forward cache after signing out.
 * Every exit goes through leaveSignedOut: caches dropped, full page load.
 */
export function SessionWatcher() {
    const handlingRef = useRef(false);

    const { data: session, status } = useSession();
    const queryClient = useQueryClient();
    const { showAlert } = useApp();
    // Bumped when a refresh (this or another tab) raised the known access expiry.
    const [refreshCount, setRefreshCount] = useState(0);
    const statusRef = useRef(status);

    const leave = useCallback((target) => {
        if (handlingRef.current) return;
        handlingRef.current = true;
        leaveSignedOut(queryClient, { target });
    }, [queryClient]);

    // The server ended the session: clear the cookies, then leave for the error page.
    const endSession = useCallback((error) => {
        if (handlingRef.current || isSigningOut()) return;

        markSigningOut();
        const target = `/auth/error?error=${encodeURIComponent(error)}`;
        signOut({ redirect: false })
            .catch(() => { /* the proxy clears the cookies of a dead session on the next load */ })
            .finally(() => leave(target));
    }, [leave]);

    // Message left by the previous page's sign out (e.g. the server could not be reached).
    useEffect(() => {
        const notice = takeAuthNotice();
        if (notice?.message) showAlert(notice.status || 200, notice.message);
    }, [showAlert]);

    // Revoked / expired / invalid session reported by /api/auth/session.
    useEffect(() => {
        if (status !== "authenticated") return;
        if (isFatalSessionError(session?.error)) endSession(session.error);
    }, [session?.error, status, endSession]);

    // Signed in -> signed out without this tab asking (another tab used next-auth signOut, the
    // cookie expired): whatever is on screen belongs to a user who is gone.
    useEffect(() => {
        const previous = statusRef.current;
        statusRef.current = status;
        if (previous === "authenticated" && status === "unauthenticated" && !isSigningOut()) {
            leave(LANDING_PATH);
        }
    }, [status, leave]);

    useEffect(() => onAuthEvent((message, { local } = {}) => {
        if (message?.type === "refreshed") setRefreshCount((n) => n + 1);
        if (message?.type === "signed-out") endSession(SESSION_ERROR.EXPIRED);
        // The user logged out in another tab: this tab follows to the landing page.
        if (message?.type === "logged-out" && !local) leave(LANDING_PATH);
    }), [endSession, leave]);

    // Back / forward cache: a page frozen while signed in can be restored after the user signed
    // out (in this or another tab). Ask the server before showing it again.
    useEffect(() => {
        const onPageShow = async (event) => {
            if (!event.persisted || statusRef.current !== "authenticated") return;
            try {
                const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
                const current = response.ok ? await response.json() : null;
                if (!current?.user || isFatalSessionError(current?.error)) leave(LANDING_PATH);
            } catch {
                // Offline: the next request will surface the session state.
            }
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, [leave]);

    // Proactive refresh: REFRESH_MARGIN_MS before expiry, or as soon as the tab becomes visible.
    useEffect(() => {
        if (status !== "authenticated") return;
        // Known access expiry: from the session, raised by refreshes in this or another tab.
        setKnownAccessExpiry(session?.accessExpiresAt);
        const accessExpiresAt = getKnownAccessExpiry();
        if (!accessExpiresAt) return;

        const refreshIfDue = () => {
            if (document.visibilityState !== "visible") return;
            if (getKnownAccessExpiry() - Date.now() > REFRESH_MARGIN_MS) return;
            refreshSession().catch((error) => {
                // Terminal failures are broadcast as `signed-out`; transient ones retry on demand.
                if (!error?.terminal) console.warn("[auth] Session refresh failed:", error?.message);
            });
        };

        const timer = setTimeout(refreshIfDue, Math.max(0, accessExpiresAt - Date.now() - REFRESH_MARGIN_MS));
        document.addEventListener("visibilitychange", refreshIfDue);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", refreshIfDue);
        };
    }, [session?.accessExpiresAt, status, refreshCount]);

    return null;
}

export function AuthSessionWatcher() {
    return (
        <>
            <SessionWatcher />
            <UserRealtimeBridge />
        </>
    );
}
