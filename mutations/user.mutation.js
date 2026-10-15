import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userClient } from "@/clients/user.client";
import { userKeys } from "@/keys/user.keys";

export function useSignUp() {
    return useMutation({
        mutationFn: async (data) => {
            const res = await userClient.signUp(data);
            return res ? { ok: Boolean(res.ok), status: res.status, data: res.data } : null;
        },
    });
}

export function useRevokeSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (sessionId) => userClient.revokeSession(sessionId),
        onSuccess: (_, sessionId) => {
            queryClient.setQueryData(userKeys.sessions(), (old) =>
                Array.isArray(old) ? old.filter((item) => String(item.id) !== String(sessionId)) : old
            );
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.sessions() }),
    });
}

export function useRevokeOtherSessions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => userClient.revokeOtherSessions(),
        onSuccess: () => {
            queryClient.setQueryData(userKeys.sessions(), (old) =>
                Array.isArray(old) ? old.filter((item) => item.current) : old
            );
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.sessions() }),
    });
}
