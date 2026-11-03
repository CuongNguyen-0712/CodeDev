import { challengeClient } from "@/clients/challenge.client";
import { challengeKeys } from "@/keys/challenge.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

const retryServerErrors = (count, error) => (error?.status ?? 500) >= 500 && count < 2;

export const challengeQueries = {
    workspace(challengeId) {
        return {
            queryKey: challengeKeys.workspace(challengeId),
            queryFn: ({ signal }) => challengeClient.getWorkspace(challengeId, { signal }),
            // The learner's own saved code: the draft hook keeps local edits, so no refetch on focus.
            ...QUERY_TIMES.personal,
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
