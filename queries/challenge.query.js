import { getCodingWorkspaceAction, getQuizStateAction } from "@/actions/challenge.actions";
import { unwrapActionResult, callWithAuthRetry } from "@/lib/actionResult";

export { unwrapActionResult };
import { challengeKeys } from "@/keys/challenge.keys";

// Server actions resolve to { success, data | message, status }; surface failures as errors.

const retryServerErrors = (count, error) => (error?.status ?? 500) >= 500 && count < 2;

export const challengeQueries = {
    workspace(challengeId) {
        return {
            queryKey: challengeKeys.workspace(challengeId),
            queryFn: async () => unwrapActionResult(await callWithAuthRetry(() => getCodingWorkspaceAction({ challengeId }))),
            staleTime: 1000 * 60,
            gcTime: 1000 * 60 * 10,
            refetchOnWindowFocus: false,
            retry: retryServerErrors,
        };
    },

    // The learner's single quiz attempt (attempted: false until they submit).
    quizState(challengeId) {
        return {
            queryKey: challengeKeys.quizState(challengeId),
            queryFn: async () => unwrapActionResult(await callWithAuthRetry(() => getQuizStateAction({ challengeId }))),
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
            retry: retryServerErrors,
        };
    },
};
