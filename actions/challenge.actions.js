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

export async function submitQuizAction({ challengeId, answers }) {
    return runAction(
        ({ userId }) => challengeService.submitQuiz({ userId, challengeId, answers: answers || {} }),
        { limiter: rateLimiters.challenge, context: "submitQuizAction" }
    );
}

export async function submitCodingAction({ challengeId, code, results }) {
    return runAction(
        ({ userId }) => challengeService.submitCoding({ userId, challengeId, code, results: results || {} }),
        { limiter: rateLimiters.challenge, context: "submitCodingAction" }
    );
}
