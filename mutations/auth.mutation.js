import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/clients/auth.client";

export function useLogin() {
    return useMutation({
        mutationFn: async (data) => {
            const res = await authClient.login(data);
            return res ? { ok: Boolean(res.ok), status: res.status, error: res.error, url: res.url } : null;
        },
    });
}

export function useLogOut() {
    return useMutation({
        mutationFn: async () => {
            const res = await authClient.logout();
            return res ? { ok: Boolean(res.ok), status: res.status } : { ok: true };
        },
    });
}