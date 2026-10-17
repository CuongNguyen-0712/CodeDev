'use server';

import { codeSubmissionService } from "@/services/codeSubmission.service";
import { runAction } from "@/lib/serverAction";

export async function getCodingHistoryAction({ challengeId }) {
    return runAction(
        ({ userId }) => codeSubmissionService.getHistory({ userId, challengeId }),
        { context: "getCodingHistoryAction" }
    );
}

export async function getSubmissionCodeAction({ challengeId, submissionId }) {
    return runAction(
        ({ userId }) => codeSubmissionService.getSubmissionCode({ userId, challengeId, submissionId }),
        { context: "getSubmissionCodeAction" }
    );
}
