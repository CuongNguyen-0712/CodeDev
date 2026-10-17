"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import { useQueryClient } from "@tanstack/react-query";

import { SESSION_ERROR, isFatalSessionError } from "@/constants/auth";
import { isSigningOut, markSigningOut } from "@/lib/authSignal";
import { disconnectPusher } from "@/lib/pusherClient";
import {
    REFRESH_MARGIN_MS,
    getKnownAccessExpiry,
    onAuthEvent,
    refreshSession,
    resetAuthRefreshState,
    setKnownAccessExpiry,
} from "@/lib/authRefresh";

import { UserRealtimeBridge } from "@/components/realtime/userRealtimeBridge";

/**
 * Client side of the session lifecycle:
 *   - refreshes the access state shortly before it expires, only while the tab is visible
 *     (hidden tabs refresh on demand when a request gets 401 ACCESS_TOKEN_EXPIRED);
 *   - signs the browser out when the server reports the session as revoked / expired / invalid
 *     (`session.error`) or when any tab's refresh failed for good. The server-side session is
 *     already over in those cases, so only local state and cookies are cleared.
 */
export function SessionWatcher() {
    const handlingRef = useRef(false);

    const { data: session, status } = useSession();
    const queryClient = useQueryClient();
    const [accessExpiresAt, setAccessExpiresAt] = useState(0);

    const endSession = useCallback((error) => {
        if (handlingRef.current || isSigningOut()) return;

        handlingRef.current = true;
        markSigningOut();
        // Private data of this user must not stay on screen or in memory.
        queryClient.clear();
        disconnectPusher();
        resetAuthRefreshState();

        const target = `/auth/error?error=${encodeURIComponent(error)}`;
        signOut({ callbackUrl: target }).catch(() => {
            // Network failure: fall back to a hard navigation, the proxy clears the cookies.
            window.location.assign(target);
        });
    }, [queryClient]);

    // Revoked / expired / invalid session reported by /api/auth/session.
    useEffect(() => {
        if (status !== "authenticated") return;
        if (isFatalSessionError(session?.error)) endSession(session.error);
    }, [session?.error, status, endSession]);

    // Known access expiry: from the session, raised by refreshes in this or another tab.
    useEffect(() => {
        if (status !== "authenticated") return;
        setKnownAccessExpiry(session?.accessExpiresAt);
        setAccessExpiresAt(getKnownAccessExpiry());
    }, [session?.accessExpiresAt, status]);

    useEffect(() => onAuthEvent((message) => {
        if (message?.type === "refreshed") setAccessExpiresAt(getKnownAccessExpiry());
        if (message?.type === "signed-out") endSession(SESSION_ERROR.EXPIRED);
    }), [endSession]);

    // Proactive refresh: REFRESH_MARGIN_MS before expiry, or as soon as the tab becomes visible.
    useEffect(() => {
        if (status !== "authenticated" || !accessExpiresAt) return;

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
    }, [accessExpiresAt, status]);

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
