import { useMutation } from "@tanstack/react-query";

import { userClient } from "@/app/clients/user.client";

export function useSignUp() {
    return useMutation({
        mutationFn: userClient.signUp,
    });
}