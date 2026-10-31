import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    submitQuizAction, queueCodeRunAction, getCodeRunAction, startCodingSubmissionAction, finishCodingSubmissionAction, openChallengeHintAction,
} from "@/actions/challenge.actions";
import { unwrapActionResult } from "@/queries/challenge.query";
import { callWithAuthRetry } from "@/lib/actionResult";

import { challengeKeys } from "@/keys/challenge.keys";
import { userKeys } from "@/keys/user.keys";

// Quick polls while a run usually finishes, slower ones after (lighter on the server under load).
const POLL_FAST_MS = 1500;
const POLL_SLOW_MS = 3000;
const POLL_FAST_FOR_MS = 20_000;
// Longer than a run's deadline (3 minutes) plus a running job's grace (150s): the server always ends it first.
const POLL_LIMIT_MS = 6 * 60_000;

/** Queues a code run, then polls until it leaves queued / running. A run that ends with an error throws it. */
async function runQueued({ challengeId, code, kind }) {
    let run = unwrapActionResult(await callWithAuthRetry(() => queueCodeRunAction({ challengeId, code, kind })));
    const startedAt = Date.now();
    while (run.status === "queued" || run.status === "running") {
        const waited = Date.now() - startedAt;
        if (waited > POLL_LIMIT_MS) {
            throw Object.assign(new Error("Grading is taking longer than usual. Reload the page in a minute to see the result."), { status: 504 });
        }
        await new Promise((resolve) => setTimeout(resolve, waited < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS));
        const runId = run.runId;
        run = unwrapActionResult(await callWithAuthRetry(() => getCodeRunAction({ runId })));
    }
    if (run.error) throw Object.assign(new Error(run.error.message), { status: run.error.status });
    return run;
}

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
            // Anything but a validation error may mean the server state moved (out of attempts,
            // cooling down, or a 5xx after the attempt was saved): reload it.
            if (error?.status !== 400) {
                queryClient.invalidateQueries({ queryKey: challengeKeys.quizState(variables.challengeId) });
            }
        },
    });
};

/** Opens a hint level. variables: { challengeId, level }; resolves to { level, body }. */
export const useOpenHint = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data) => unwrapActionResult(await callWithAuthRetry(() => openChallengeHintAction(data))),
        // The lesson payload lists opened hints: refetch it on the next mount, not now (no re-render mid-lesson).
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...userKeys.all, 'learningProgress'], refetchType: 'none' }),
    });
};

/** Runs the sample tests in the code runner (languages other than javascript). variables: { challengeId, code } */
export const useRunCodingSamples = () => useMutation({
    mutationFn: ({ challengeId, code }) => runQueued({ challengeId, code, kind: "manual" }),
});

/**
 * Coding submission.
 *   serverGraded (a code runner is configured): one queued run grades every test on the server.
 *   Otherwise (development only, javascript) two steps:
 *     1. start  - the server re-checks the sample test results, snapshots the code to S3 and records
 *                 the attempt, then returns the hidden test inputs;
 *     2. finish - `runHidden(hiddenTests)` runs them in the browser sandbox and the server grades them.
 * variables: { challengeId, code, serverGraded, results (sample tests payload), runHidden }
 */
export const useSubmitCoding = () => {
    const queryClient = useQueryClient();

    const patchWorkspace = (challengeId, patch) => {
        queryClient.setQueryData(challengeKeys.workspace(challengeId), (old) => old && { ...old, ...patch(old) });
    };

    return useMutation({
        mutationFn: async ({ challengeId, code, serverGraded, results, runHidden }) => {
            if (serverGraded) return runQueued({ challengeId, code, kind: "submit" });

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
