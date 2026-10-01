import { useMutation } from "@tanstack/react-query";
import { userClient } from "@/clients/user.client";

export function useSignUp() {
    return useMutation({
        mutationFn: async (data) => {
            const res = await userClient.signUp(data);
            return res ? { ok: Boolean(res.ok), status: res.status, data: res.data } : null;
        },
    });
}