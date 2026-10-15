"use client";

import { useCallback, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { usePusherChannel } from "@/hooks/usePusherChannel";
import { channels, events } from "@/lib/realtime";
import { isSigningOut, markSigningOut } from "@/lib/authSignal";
import { disconnectPusher } from "@/lib/pusherClient";
import { SESSION_ERROR } from "@/constants/auth";
import { useApp } from "@/contexts/appContext";

import { userKeys } from "@/keys/user.keys";
import { courseKeys } from "@/keys/course.keys";

/**
 * Listens on the signed-in user's private channel and keeps every open tab / device in sync:
 * - session-revoked: this device was signed out elsewhere -> sign out now
 * - progress-updated / challenge-submitted / profile-updated -> refetch the affected queries
 * Renders nothing.
 */
export function UserRealtimeBridge() {
    const { data: session, status } = useSession();
    const queryClient = useQueryClient();
    const { showAlert: alert } = useApp();

    const userId = status === "authenticated" && !session?.error ? session?.user?.id : null;
    const sessionId = session?.user?.sessionId;

    // A fresh sign-in in this tab (no reload since the last sign out) re-arms the listener.
    useEffect(() => {
        if (userId && sessionId) markSigningOut(false);
    }, [userId, sessionId]);

    const refreshUserData = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: userKeys.all });
    }, [queryClient]);

    usePusherChannel(
        userId ? channels.user(userId) : null,
        {
            [events.SESSION_REVOKED]: async ({ sessionIds = [], reason } = {}) => {
                if (isSigningOut()) return;

                if (!sessionIds.map(String).includes(String(sessionId))) {
                    // Another device was signed out: refresh the device list.
                    queryClient.invalidateQueries({ queryKey: userKeys.sessions() });
                    return;
                }

                markSigningOut();
                queryClient.clear();
                disconnectPusher();

                const callbackUrl = reason === "logout"
                    ? "/auth"
                    : `/auth/error?error=${SESSION_ERROR.REVOKED}`;
                await signOut({ callbackUrl });
            },

            [events.PROGRESS_UPDATED]: ({ courseId } = {}) => {
                refreshUserData();
                if (courseId) {
                    queryClient.invalidateQueries({ queryKey: courseKeys.details(courseId) });
                }
            },

            [events.CHALLENGE_SUBMITTED]: ({ passed, awardedPoints } = {}) => {
                // Not the open challenge workspace: refetching it could reset the editor.
                refreshUserData();
                if (passed && awardedPoints > 0 && document.visibilityState !== "visible") {
                    // Surfaced when the user returns to a background tab.
                    alert?.(200, `Challenge passed: +${awardedPoints} points`);
                }
            },

            [events.PROFILE_UPDATED]: () => {
                queryClient.invalidateQueries({ queryKey: userKeys.me() });
            },
        },
        { onReconnect: refreshUserData }
    );

    return null;
}

export default UserRealtimeBridge;
