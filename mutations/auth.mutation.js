import { useMutation } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import { authClient } from "@/clients/auth.client";
import { markSigningOut } from "@/lib/authSignal";
import { disconnectPusher } from "@/lib/pusherClient";

export function useLogin() {
    return useMutation({
        mutationFn: async (data) => {
            const res = await authClient.login(data);
            return res ? { ok: Boolean(res.ok), status: res.status, error: res.error, url: res.url } : null;
        },
    });
}

/**
 * Revokes the server session, then clears the cookie. The cookie is cleared even when the
 * revoke call fails (offline, 5xx): the user asked to leave, so never keep them signed in.
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
                console.error("[auth] Server logout failed, clearing the local session anyway:", error?.message);
            }

            disconnectPusher();
            await signOut({ redirect: false });

            return { ok: true, revoked };
        },
        onError: () => markSigningOut(false),
    });
}
