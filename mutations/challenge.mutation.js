import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitQuizAction, submitCodingAction } from "@/actions/challenge.actions";
import { unwrapActionResult } from "@/queries/challenge.query";

import { challengeKeys } from "@/keys/challenge.keys";
import { userKeys } from "@/keys/user.keys";

function invalidateRewards(queryClient) {
    queryClient.invalidateQueries({ queryKey: userKeys.me() });
    queryClient.invalidateQueries({ queryKey: userKeys.overview() });
}

export const useSubmitQuiz = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => unwrapActionResult(await submitQuizAction(data)),

        onSuccess: (result) => {
            if (result?.awardedPoints > 0) invalidateRewards(queryClient);
        },
    });
};

export const useSubmitCoding = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => unwrapActionResult(await submitCodingAction(data)),

        onSuccess: (result, variables) => {
            // Patch the cached workspace instead of refetching it, so the open editor is not reloaded.
            queryClient.setQueryData(challengeKeys.workspace(variables.challengeId), (old) => old && ({
                ...old,
                attempts: (old.attempts || 0) + 1,
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
