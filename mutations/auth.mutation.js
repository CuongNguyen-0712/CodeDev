import { useMutation } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import { authClient } from "@/clients/auth.client";
import { markSigningOut } from "@/lib/authSignal";
import { announceLoggedOut } from "@/lib/authRefresh";
import { devLog } from "@/lib/userMessage";

export function useLogin() {
    return useMutation({
        mutationFn: async (data) => {
            const res = await authClient.login(data);
            return res ? { ok: Boolean(res.ok), status: res.status, error: res.error, url: res.url } : null;
        },
    });
}

/**
 * Revokes the server session, then clears the cookies. The cookies are cleared even when the
 * revoke call fails (offline, 5xx): the user asked to leave, so never keep them signed in.
 * Other tabs are told to leave too. The caller finishes with `leaveSignedOut` (lib/authNavigation),
 * which drops every client cache and loads the landing page.
 * Resolves to `{ ok, revoked }` — `revoked: false` means the server session may still be alive.
 */
export function useLogOut() {
    return useMutation({
        mutationFn: async () => {
            markSigningOut();

            let revoked = true;
            try {
                await authClient.logout();
            } catch (error) {
                revoked = false;
                devLog("[auth] Server logout failed, clearing the local session anyway:", error?.message);
            }

            await signOut({ redirect: false });
            announceLoggedOut();

            return { ok: true, revoked };
        },
        onError: () => markSigningOut(false),
    });
}
