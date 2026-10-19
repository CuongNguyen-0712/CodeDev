import { getCodingHistoryAction, getSubmissionCodeAction } from "@/actions/codeSubmission.actions";
import { unwrapActionResult } from "@/lib/actionResult";
import { callWithAuthRetry } from "@/lib/actionResult";
import { challengeKeys } from "@/keys/challenge.keys";
import { QUERY_TIMES } from "@/lib/queryTimes";

const retryServerErrors = (count, error) => (error?.status ?? 500) >= 500 && count < 2;

// Under challengeKeys.all, so invalidating ['challenge'] refreshes the history too.
export const codeSubmissionKeys = {
    history: (challengeId) => [...challengeKeys.all, 'submissions', String(challengeId)],
    code: (challengeId, submissionId) => [...challengeKeys.all, 'submissions', String(challengeId), 'code', String(submissionId)],
};

export const codeSubmissionQueries = {
    history(challengeId) {
        return {
            queryKey: codeSubmissionKeys.history(challengeId),
            queryFn: async () => unwrapActionResult(await callWithAuthRetry(() => getCodingHistoryAction({ challengeId }))),
            ...QUERY_TIMES.personal,
            refetchOnWindowFocus: false,
            retry: retryServerErrors,
        };
    },

    // A submission's code never changes once stored.
    code(challengeId, submissionId) {
        return {
            queryKey: codeSubmissionKeys.code(challengeId, submissionId),
            queryFn: async () => unwrapActionResult(await callWithAuthRetry(() => getSubmissionCodeAction({ challengeId, submissionId }))),
            ...QUERY_TIMES.immutable,
            refetchOnWindowFocus: false,
            retry: retryServerErrors,
        };
    },
};
