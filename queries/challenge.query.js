import { getCodingWorkspaceAction } from "@/actions/challenge.actions";
import { unwrapActionResult } from "@/lib/actionResult";

export { unwrapActionResult };
import { challengeKeys } from "@/keys/challenge.keys";

// Server actions resolve to { success, data | message, status }; surface failures as errors.

export const challengeQueries = {
    workspace(challengeId) {
        return {
            queryKey: challengeKeys.workspace(challengeId),
            queryFn: async () => unwrapActionResult(await getCodingWorkspaceAction({ challengeId })),
            staleTime: 1000 * 60,
            gcTime: 1000 * 60 * 10,
            refetchOnWindowFocus: false,
            retry: (count, error) => (error?.status ?? 500) >= 500 && count < 2,
        };
    },
};
