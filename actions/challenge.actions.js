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
        { limiter: rateLimiters.challenge, context: "submitQuizAction" }
    );
}

// "Run" for languages the browser cannot execute: sample tests in the code runner, nothing recorded.
export async function runCodingSamplesAction({ challengeId, code }) {
    return runAction(
        ({ userId }) => challengeService.runCodingSamples({ userId, challengeId, code }),
        { limiter: rateLimiters.challenge, context: "runCodingSamplesAction" }
    );
}

// Coding submissions are two calls: start (sample tests verified, snapshot stored, attempt used,
// hidden inputs returned) then finish (hidden test outputs graded).
export async function startCodingSubmissionAction({ challengeId, code, results }) {
    return runAction(
        ({ userId }) => challengeService.startCodingSubmission({ userId, challengeId, code, results: results || {} }),
        { limiter: rateLimiters.challenge, context: "startCodingSubmissionAction" }
    );
}

export async function finishCodingSubmissionAction({ challengeId, submissionId, results }) {
    return runAction(
        ({ userId }) => challengeService.finishCodingSubmission({ userId, challengeId, submissionId, results: results || {} }),
        { limiter: rateLimiters.challenge, context: "finishCodingSubmissionAction" }
    );
}
