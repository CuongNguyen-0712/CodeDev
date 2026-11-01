import { adminDb } from "@/db/admin.db";
import { adminRunDb, RUN_TABS } from "@/db/adminRun.db";
import { codeRunDb } from "@/db/codeRun.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";

/**
 * Admin code runs (docs/admin-panel-plan.md 04). Cancelling uses codeRunDb.finish, which only
 * changes a queued or running row: a queued run's Inngest step then finds nothing to start, and a
 * result arriving from the sandbox afterwards cannot overwrite the cancellation.
 */

const CANCEL_MESSAGE = "An admin stopped this run. Try again; no attempt was used.";

function decodeCursor(raw) {
    if (!raw) return null;
    try {
        const [at, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (!Number.isNaN(Date.parse(at)) && /^\d{1,19}$/.test(id)) return { at, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

const audit = (actor, action, runId, reason, extra = {}) => withTransaction((client) =>
    adminDb.audit(client, { actorId: actor.id, action, targetType: "code_run", targetId: runId, reason, ...extra }));

/** Test results without learner outputs unless asked (outputs can reveal hidden test data). */
function testsOf(result, withOutputs) {
    return (result?.graded || []).map((t) => ({
        id: t.testCaseId ?? null,
        name: t.name ?? null,
        hidden: Boolean(t.isHidden),
        status: t.status,
        timeMs: t.timeMs ?? null,
        ...(withOutputs ? { actual: t.actual ?? null, expected: t.expected ?? null, error: t.error ?? null, output: t.output ?? null } : {}),
    }));
}

export const adminRunService = {
    tabs: RUN_TABS,

    list: async ({ tab, language, runType, userId, cursor, limit = 50 }) => {
        const [{ rows }, counts, queue] = await Promise.all([
            adminRunDb.list({ tab, language, runType, userId, cursor: decodeCursor(cursor), limit: limit + 1 }),
            adminRunDb.tabCounts(),
            adminRunDb.queue(),
        ]);
        const page = rows.slice(0, limit);
        const last = page[page.length - 1];
        return {
            items: page.map(({ cursor_at, cursor_id, ...row }) => row),
            nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([last.cursor_at, last.cursor_id])).toString("base64url") : null,
            counts,
            queue,
        };
    },

    detail: async ({ runId, withOutputs = false }) => {
        const run = await adminRunDb.detail({ runId });
        if (!run) throw new ApiError("Run not found", 404);
        const { result, ...rest } = run;
        return {
            ...rest,
            tests: testsOf(result, withOutputs),
            outcome: result?.outcome ?? null,
            rejected: result?.rejected ?? null,
        };
    },

    /** The learner's code: every read is written to the audit log. */
    source: async ({ actor, runId }) => {
        const run = await adminRunDb.detail({ runId });
        if (!run) throw new ApiError("Run not found", 404);
        const code = await adminRunDb.source({ runId });
        await audit(actor, "submission.view", runId, null);
        return { code, removed: code == null, tests: testsOf(run.result, true) };
    },

    cancel: async ({ actor, runId, reason, ip = null }) => {
        const run = await adminRunDb.detail({ runId });
        if (!run) throw new ApiError("Run not found", 404);
        const cancelled = await codeRunDb.finish({ publicId: runId, status: "cancelled", error: CANCEL_MESSAGE });
        if (!cancelled) throw new ApiError("This run has already finished", 409, { code: "RUN_FINISHED" });
        await audit(actor, "coderun.cancel", runId, reason, { before: { status: run.status }, after: { status: "cancelled" }, ip });
        return { id: runId, status: "cancelled" };
    },

    /** Closes every run past its deadline now, instead of waiting for the hourly sweeper. */
    expireAll: async ({ actor, reason, ip = null }) => {
        const closed = await codeRunDb.expireAll({ limit: 500 });
        await audit(actor, "coderun.expire_all", "expired", reason, { after: { closed }, ip });
        return { closed };
    },
};
