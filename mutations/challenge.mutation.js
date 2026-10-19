import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitQuizAction, startCodingSubmissionAction, finishCodingSubmissionAction } from "@/actions/challenge.actions";
import { unwrapActionResult } from "@/queries/challenge.query";
import { callWithAuthRetry } from "@/lib/actionResult";

import { challengeKeys } from "@/keys/challenge.keys";
import { userKeys } from "@/keys/user.keys";

function invalidateRewards(queryClient) {
    queryClient.invalidateQueries({ queryKey: userKeys.me() });
    queryClient.invalidateQueries({ queryKey: userKeys.overview() });
    queryClient.invalidateQueries({ queryKey: userKeys.experience() });
}

export const useSubmitQuiz = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => unwrapActionResult(await callWithAuthRetry(() => submitQuizAction(data))),

        onSuccess: (result, variables) => {
            // The response is the new server-side quiz state (attempts left, cooldown, result).
            queryClient.setQueryData(challengeKeys.quizState(variables.challengeId), result);
            if (result?.awardedPoints > 0) invalidateRewards(queryClient);
        },

        onError: (error, variables) => {
            // Out of attempts, already passed or still cooling down: reload the server state.
            if (error?.status === 409 || error?.status === 429) {
                queryClient.invalidateQueries({ queryKey: challengeKeys.quizState(variables.challengeId) });
            }
        },
    });
};

/**
 * Two-step coding submission:
 *   1. start  - the server re-checks the sample test results, snapshots the code to S3 and records
 *               the attempt, then returns the hidden test inputs;
 *   2. finish - `runHidden(hiddenTests)` runs them in the browser sandbox and the server grades them.
 * variables: { challengeId, code, results (sample tests payload), runHidden }
 */
export const useSubmitCoding = () => {
    const queryClient = useQueryClient();

    const patchWorkspace = (challengeId, patch) => {
        queryClient.setQueryData(challengeKeys.workspace(challengeId), (old) => old && { ...old, ...patch(old) });
    };

    return useMutation({
        mutationFn: async ({ challengeId, code, results, runHidden }) => {
            const started = unwrapActionResult(await callWithAuthRetry(() => startCodingSubmissionAction({ challengeId, code, results })));

            // From here on the attempt is spent, even if the next step fails.
            patchWorkspace(challengeId, () => ({ attempts: started.attempts }));

            try {
                const hiddenResults = await runHidden(started.hiddenTests || []);
                return unwrapActionResult(await callWithAuthRetry(() => finishCodingSubmissionAction({
                    challengeId,
                    submissionId: started.submissionId,
                    results: hiddenResults,
                })));
            } catch (error) {
                error.attemptUsed = true;
                throw error;
            }
        },

        onSuccess: (result, variables) => {
            // Patch the cached workspace instead of refetching it, so the open editor is not reloaded.
            patchWorkspace(variables.challengeId, (old) => ({
                attempts: result.attempts ?? old.attempts,
                hasPassed: old.hasPassed || result.passed,
                server: {
                    code: variables.code,
                    version: (old.server?.version || 0) + 1,
                    updatedAt: result.submittedAt,
                },
                lastSubmission: {
                    id: result.submissionId,
                    status: result.status,
                    score: result.score,
                    submitted_at: result.submittedAt,
                    tests_passed: result.testsPassed,
                    tests_total: result.testsTotal,
                },
            }));
            if (result?.awardedPoints > 0) invalidateRewards(queryClient);
        },
    });
};
