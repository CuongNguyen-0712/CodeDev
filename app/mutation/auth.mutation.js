import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/app/clients/auth.client";

export function useLogin() {
    return useMutation({
        mutationFn: authClient.login,
    });
}

export function useLogOut() {
    return useMutation({
        mutationFn: authClient.logout,
    });
}