// Course comments and the CodeDev feedback inbox in the admin (docs/admin-panel-plan.md 11.3):
// listing per course and across courses, hiding a comment with an audit row, marking feedback handled.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `af${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("admin comments and feedback (PostgreSQL)", () => {
    let sql, adminFeedbackService, coursePublicId, commentId, feedbackId;
    const actor = { id: null, publicId: `${TAG}_admin`, rank: 80 };
    let learnerId;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ adminFeedbackService } = await import("@/services/adminFeedback.service"));
        const course = (await sql(`SELECT id::text AS id, public_id FROM catalog.course WHERE is_deleted IS NOT TRUE ORDER BY id LIMIT 1`)).rows[0];
        coursePublicId = course.public_id;
        const newUser = async (publicId) => {
            const id = String(990000000000000 + Math.floor(Math.random() * 1e9));
            await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, publicId, `${publicId}@test.invalid`]);
            return id;
        };
        actor.id = await newUser(actor.publicId);
        learnerId = await newUser(`${TAG}_learner`);
        commentId = (await sql(
            `INSERT INTO community.comment (user_id, reference_id, content) VALUES ($1, $2, $3) RETURNING public_id::text AS id`,
            [learnerId, course.id, `${TAG} a comment to moderate`]
        )).rows[0].id;
        feedbackId = (await sql(
            `INSERT INTO community.feedback (user_id, title, feedback) VALUES ($1, $2, 'The editor could be faster') RETURNING id::text AS id`,
            [learnerId, `${TAG} feedback`]
        )).rows[0].id;
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM community.comment WHERE public_id::text = $1`, [commentId]);
        await sql(`DELETE FROM community.feedback WHERE id::text = $1`, [feedbackId]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("lists the new comment for its course and across courses, with counts", async () => {
        const one = await adminFeedbackService.listComments({ courseId: coursePublicId });
        expect(one.items[0]).toMatchObject({ id: commentId, username: `${TAG}_learner`, hidden: false, course_id: coursePublicId });
        expect(one.counts.all).toBeGreaterThanOrEqual(1);
        const every = await adminFeedbackService.listComments({});
        expect(every.items.some((item) => item.id === commentId)).toBe(true);
        await expect(adminFeedbackService.listComments({ courseId: `${TAG}-none` })).rejects.toMatchObject({ status: 404 });
        await expect(adminFeedbackService.listComments({ cursor: "garbage" })).rejects.toMatchObject({ status: 400 });
    });

    it("hides a comment from the course page with an audit row, and shows it again", async () => {
        const reason = "off-topic test comment";
        await expect(adminFeedbackService.setCommentHidden({ actor, commentId, hidden: true, reason })).resolves.toEqual({ changed: true });
        const hidden = await adminFeedbackService.listComments({ courseId: coursePublicId, state: "hidden" });
        expect(hidden.items.some((item) => item.id === commentId)).toBe(true);
        const learnerView = (await sql(`SELECT is_hidden FROM community.comment WHERE public_id::text = $1`, [commentId])).rows[0];
        expect(learnerView.is_hidden).toBe(true);
        await expect(adminFeedbackService.setCommentHidden({ actor, commentId, hidden: true, reason })).resolves.toEqual({ changed: false });
        await adminFeedbackService.setCommentHidden({ actor, commentId, hidden: false, reason });
        const audit = (await sql(`SELECT action, target_id FROM identity.audit_log WHERE actor_id = $1 ORDER BY id`, [actor.id])).rows;
        expect(audit).toEqual([{ action: "comment.hide", target_id: commentId }, { action: "comment.show", target_id: commentId }]);
    });

    it("marks feedback handled and open again", async () => {
        const open = await adminFeedbackService.listFeedback({ state: "open" });
        expect(open.items.some((item) => item.id === feedbackId && item.username === `${TAG}_learner`)).toBe(true);
        await expect(adminFeedbackService.setFeedbackHandled({ actor, feedbackId, handled: true })).resolves.toEqual({ changed: true });
        const handled = await adminFeedbackService.listFeedback({ state: "handled" });
        expect(handled.items.find((item) => item.id === feedbackId)).toMatchObject({ handled_by: actor.publicId });
        await adminFeedbackService.setFeedbackHandled({ actor, feedbackId, handled: false });
        expect((await adminFeedbackService.listFeedback({ state: "open" })).items.some((item) => item.id === feedbackId)).toBe(true);
    });
});
