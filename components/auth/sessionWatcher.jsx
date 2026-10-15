"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

import { useQueryClient } from "@tanstack/react-query";

import { isFatalSessionError } from "@/constants/auth";
import { isSigningOut, markSigningOut } from "@/lib/authSignal";
import { disconnectPusher } from "@/lib/pusherClient";

import { UserRealtimeBridge } from "@/components/realtime/userRealtimeBridge";

/**
 * Signs the browser out once the server reports the session as revoked / expired / invalid
 * (`session.error`, refreshed every 60s by SessionProvider and on window focus).
 * The server-side session is already dead in those cases, so only the cookie needs clearing:
 * no logout API call that could fail and leave the user stuck.
 */
export function SessionWatcher() {
    const handlingRef = useRef(false);

    const { data: session, status } = useSession();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (status !== "authenticated") return;

        const error = session?.error;
        if (!isFatalSessionError(error) || handlingRef.current || isSigningOut()) return;

        handlingRef.current = true;
        markSigningOut();
        queryClient.clear();
        disconnectPusher();

        signOut({ callbackUrl: `/auth/error?error=${encodeURIComponent(error)}` }).catch(() => {
            // Network failure: fall back to a hard navigation, the proxy clears the cookie.
            window.location.assign(`/auth/error?error=${encodeURIComponent(error)}`);
        });
    }, [session?.error, status, queryClient]);

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
