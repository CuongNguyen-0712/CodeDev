import { challengeClient } from "@/clients/challenge.client";
import { challengeKeys } from "@/keys/challenge.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

const retryServerErrors = (count, error) => (error?.status ?? 500) >= 500 && count < 2;

export const challengeQueries = {
    workspace(challengeId) {
        return {
            queryKey: challengeKeys.workspace(challengeId),
            queryFn: ({ signal }) => challengeClient.getWorkspace(challengeId, { signal }),
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
            queryFn: ({ signal }) => challengeClient.getQuizState(challengeId, { signal }),
            // Attempts / cooldown change with time and with submits in other tabs.
            ...QUERY_TIMES.live,
            refetchOnWindowFocus: false,
            retry: retryServerErrors,
        };
    },
};
