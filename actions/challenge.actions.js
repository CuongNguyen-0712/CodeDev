'use server';

import { challengeService } from "@/services/challenge.service";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

export async function getCodingWorkspaceAction({ challengeId }) {
    return runAction(
        ({ userId }) => challengeService.getCodingWorkspace({ userId, challengeId }),
        { context: "getCodingWorkspaceAction" }
    );
}

export async function getQuizStateAction({ challengeId }) {
    return runAction(
        ({ userId }) => challengeService.getQuizState({ userId, challengeId }),
        { context: "getQuizStateAction" }
    );
}

export async function submitQuizAction({ challengeId, answers }) {
    return runAction(
        ({ userId }) => challengeService.submitQuiz({ userId, challengeId, answers: answers || {} }),
        { limiter: rateLimiters.quiz, context: "submitQuizAction" }
    );
}

export async function openChallengeHintAction({ challengeId, level }) {
    return runAction(
        ({ userId }) => challengeService.openHint({ userId, challengeId, level }),
        { context: "openChallengeHintAction" }
    );
}

// Graded by the code runner: Run (`manual`, sample tests, nothing recorded) or Submit (`submit`).
// Returns at once with `status: "queued"`; poll getCodeRunAction until it finishes.
export async function queueCodeRunAction({ challengeId, code, kind }) {
    return runAction(
        ({ userId }) => challengeService.queueCodeRun({ userId, challengeId, code, kind }),
        { limiter: kind === "submit" ? rateLimiters.codeSubmit : rateLimiters.codeRun, context: "queueCodeRunAction" }
    );
}

export async function getCodeRunAction({ runId }) {
    return runAction(
        ({ userId }) => challengeService.getCodeRun({ userId, runId }),
        { limiter: rateLimiters.codeRunPoll, context: "getCodeRunAction" }
    );
}

// Without a code runner (development only), javascript is graded from browser-reported outputs in
// two calls: start (sample tests verified, snapshot stored, attempt used, hidden inputs returned)
// then finish (hidden test outputs graded).
export async function startCodingSubmissionAction({ challengeId, code, results }) {
    return runAction(
        ({ userId }) => challengeService.startCodingSubmission({ userId, challengeId, code, results: results || {} }),
        { limiter: rateLimiters.codeSubmit, context: "startCodingSubmissionAction" }
    );
}

export async function finishCodingSubmissionAction({ challengeId, submissionId, results }) {
    return runAction(
        ({ userId }) => challengeService.finishCodingSubmission({ userId, challengeId, submissionId, results: results || {} }),
        { limiter: rateLimiters.codeSubmit, context: "finishCodingSubmissionAction" }
    );
}
