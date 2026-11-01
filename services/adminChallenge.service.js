import { adminDb } from "@/db/admin.db";
import { adminChallengeDb } from "@/db/adminChallenge.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";

const view = (row) => ({ status: row.status, isPublished: row.is_published, points: row.points });

/** Challenge status, publishing and points (docs/admin-panel-plan.md 04); test cases stay in the seeds. */
export const adminChallengeService = {
    listByCourse: async ({ courseId }) => (await adminChallengeDb.listByCourse({ coursePublicId: courseId })).rows,

    update: async ({ actor, challengeId, input, ip = null }) => withTransaction(async (client) => {
        const before = await adminChallengeDb.lock(client, challengeId);
        if (!before) throw new ApiError("Challenge not found", 404);
        await adminChallengeDb.update(client, { id: before.id, status: input.status, isPublished: input.isPublished, points: input.points });
        const after = await adminChallengeDb.lock(client, challengeId);
        await adminDb.audit(client, {
            actorId: actor.id, action: "challenge.update", targetType: "challenge", targetId: challengeId,
            reason: input.reason, before: view(before), after: view(after), ip,
        });
        return { id: challengeId, ...view(after) };
    }),
};
