import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAvatarAction, markNotificationsAction, restoreAvatarAction, updatePrivacyAction } from "@/actions/user.actions";
import { userClient } from "@/clients/user.client";
import { userKeys } from "@/keys/user.keys";
import { callAction } from "@/lib/actionResult";

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

/** Makes a kept photo the profile photo again. */
export function useRestoreAvatar() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (assetId) => callAction(() => restoreAvatarAction(assetId)),
        onSettled: () => Promise.all([
            queryClient.invalidateQueries({ queryKey: userKeys.me() }),
            queryClient.invalidateQueries({ queryKey: userKeys.avatars() }),
        ]),
    });
}

export function useDeleteAvatar() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (assetId) => callAction(() => deleteAvatarAction(assetId)),
        onSuccess: (_, assetId) => {
            queryClient.setQueryData(userKeys.avatars(), (old) =>
                Array.isArray(old) ? old.filter((item) => item.id !== assetId) : old
            );
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.avatars() }),
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

// Privacy switches: the saved values replace the cache; ranking views refetch (opt-out changes them).
export function useUpdatePrivacy() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => callAction(() => updatePrivacyAction(data)),
        onSuccess: (saved) => {
            queryClient.setQueryData(userKeys.privacy(), saved);
            queryClient.invalidateQueries({ queryKey: [...userKeys.all, 'ranking'] });
            queryClient.invalidateQueries({ queryKey: userKeys.ranks() });
        },
    });
}

// Mark inbox items read ({ ids } or { all: true }); both list variants and the count refetch.
export function useMarkNotificationsRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body) => callAction(() => markNotificationsAction(body)),
        onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.notifications() }),
    });
}

// Remove inbox items ({ ids }); the rows leave both lists at once, then everything refetches.
export function useDismissNotifications() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids) => callAction(() => markNotificationsAction({ ids, dismiss: true })),
        onMutate: (ids) => {
            const gone = new Set(ids);
            queryClient.setQueriesData({ queryKey: userKeys.notifications() }, (old) => old?.pages ? {
                ...old,
                pages: old.pages.map((page) => ({ ...page, items: (page.items || []).filter((item) => !gone.has(item.id)) })),
            } : old);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.notifications() }),
    });
}
