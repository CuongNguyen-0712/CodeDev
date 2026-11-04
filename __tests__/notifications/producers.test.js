import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where inbox rows come from (docs/notification-plan.md 1 and 3.1): each producer calls the
 * notification service once, after its own write, and not at all on a replay or a no-op.
 */
const notify = vi.fn(async () => ({ id: "n" }));
const notifyCourse = vi.fn(async () => ({ id: "n" }));
vi.mock("@/services/notification.service", () => ({ notificationService: { notify: (...a) => notify(...a), notifyCourse: (...a) => notifyCourse(...a) } }));

const commerceDb = { redeem: vi.fn(), applyPaymentEvent: vi.fn(), getOrder: vi.fn() };
vi.mock("@/db/commerce.db", () => ({ commerceDb }));
vi.mock("@/lib/cacheKeys", () => ({ invalidateUserCache: vi.fn(async () => {}), cacheKeys: {}, TTL: {} }));
vi.mock("@/lib/pusher", () => ({ publishToUser: vi.fn(), publish: vi.fn() }));
vi.mock("@/services/payments", () => ({ getCheckoutProvider: () => null }));
vi.mock("@/services/emailVerification.service", () => ({ emailVerificationService: { assertVerified: vi.fn(async () => {}) } }));

const client = {};
vi.mock("@/lib/dbTransaction", () => ({ withTransaction: (fn) => fn(client) }));
const adminDb = { findUserForUpdate: vi.fn(), postPoints: vi.fn(), postExp: vi.fn(), audit: vi.fn(async () => {}) };
vi.mock("@/db/admin.db", () => ({ adminDb }));
vi.mock("@/lib/cache", () => ({ redis: { del: vi.fn() } }));
vi.mock("@/lib/pageCache", () => ({ revalidateCoursePage: vi.fn(), revalidateCatalogStats: vi.fn() }));
vi.mock("@/services/adminUser.service", () => ({ maskEmail: (v) => v }));

const adminFeedbackDb = { lockComment: vi.fn(), setCommentHidden: vi.fn(), lockFeedback: vi.fn(), setFeedbackHandled: vi.fn() };
vi.mock("@/db/adminFeedback.db", () => ({ adminFeedbackDb, COMMENT_STATES: [], FEEDBACK_STATES: [] }));

const { commerceService } = await import("@/services/commerce.service");
const { adminService } = await import("@/services/admin.service");
const { adminFeedbackService } = await import("@/services/adminFeedback.service");

const actor = { id: "1", publicId: "admin1", rank: 100 };

beforeEach(() => { notify.mockClear(); notifyCourse.mockClear(); });

describe("commerce", () => {
    it("redeem notifies access once, not on a replay", async () => {
        commerceDb.redeem.mockResolvedValueOnce({ rows: [{ order_id: "o1", course_id: "c1", replayed: false }] });
        await commerceService.redeem({ userId: "u1", courseId: "c1", idempotencyKey: "k".repeat(10) });
        expect(notifyCourse).toHaveBeenCalledWith("u1", "access_granted", "c1", "o1");

        commerceDb.redeem.mockResolvedValueOnce({ rows: [{ order_id: "o1", course_id: "c1", replayed: true }] });
        await commerceService.redeem({ userId: "u1", courseId: "c1", idempotencyKey: "k".repeat(10) });
        expect(notifyCourse).toHaveBeenCalledTimes(1);
    });

    it("a paid webhook names the order's course; a refund says so; closed says nothing", async () => {
        const event = { eventId: "e", type: "t", providerRef: "r", paymentId: "p", amountMinor: 1, currency: "VND" };
        commerceDb.applyPaymentEvent.mockResolvedValueOnce({ rows: [{ result: "granted", order_id: "o2", user_id: "u2" }] });
        commerceDb.getOrder.mockResolvedValueOnce({ rows: [{ course_id: "c2" }] });
        await commerceService.applyPaymentEvent({ provider: "mock", event, rawBody: "{}" });
        expect(notifyCourse).toHaveBeenCalledWith("u2", "access_granted", "c2", "o2");

        commerceDb.applyPaymentEvent.mockResolvedValueOnce({ rows: [{ result: "revoked", order_id: "o3", user_id: "u2" }] });
        await commerceService.applyPaymentEvent({ provider: "mock", event, rawBody: "{}" });
        expect(notify).toHaveBeenCalledWith("u2", expect.objectContaining({ kind: "access_revoked", link: "/orders/o3", dedupeKey: "o3" }));

        commerceDb.applyPaymentEvent.mockResolvedValueOnce({ rows: [{ result: "closed", order_id: "o4", user_id: "u2" }] });
        await commerceService.applyPaymentEvent({ provider: "mock", event, rawBody: "{}" });
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notifyCourse).toHaveBeenCalledTimes(1);
    });
});

describe("admin adjustments", () => {
    beforeEach(() => adminDb.findUserForUpdate.mockResolvedValue({ id: "9", public_id: "u3", points: 10, rank: 1 }));

    it("tells the learner the amount, never the internal reason, and only once per key", async () => {
        adminDb.postPoints.mockResolvedValueOnce({ created: true, balance_after: 60 });
        await adminService.adjustPoints({ actor, input: { userId: "u3", amount: 50, reason: "goodwill gesture", idempotencyKey: "key-12345" } });
        expect(notify).toHaveBeenCalledWith("u3", {
            kind: "balance_adjusted", title: "Points adjusted", message: "The CodeDev team added 50 points to your account.",
            link: "/orders?tab=points", dedupeKey: "points:key-12345",
        });

        adminDb.postPoints.mockResolvedValueOnce({ created: false, balance_after: 60 });
        await adminService.adjustPoints({ actor, input: { userId: "u3", amount: 50, reason: "goodwill gesture", idempotencyKey: "key-12345" } });
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("an EXP removal reads as removed", async () => {
        adminDb.postExp.mockResolvedValueOnce({ created: true, exp_after: 0, new_level: 1, awarded: -20 });
        await adminService.adjustExperience({ actor, input: { userId: "u3", amount: -20, reason: "duplicate award", idempotencyKey: "key-67890" } });
        expect(notify).toHaveBeenCalledWith("u3", expect.objectContaining({ title: "EXP adjusted", message: "The CodeDev team removed 20 EXP from your account." }));
    });
});

describe("moderation", () => {
    it("hiding a comment tells its author; showing it again does not", async () => {
        adminFeedbackDb.lockComment.mockResolvedValueOnce({ id: "7", is_hidden: false, course_id: "c1", author_id: "u4" });
        await adminFeedbackService.setCommentHidden({ actor, commentId: "cm1", hidden: true, reason: "spam links" });
        expect(notify).toHaveBeenCalledWith("u4", expect.objectContaining({ kind: "content_hidden", dedupeKey: "comment:cm1", link: "/help" }));
        expect(notify.mock.calls[0][1].message).not.toContain("spam links");

        adminFeedbackDb.lockComment.mockResolvedValueOnce({ id: "7", is_hidden: true, course_id: "c1", author_id: "u4" });
        await adminFeedbackService.setCommentHidden({ actor, commentId: "cm1", hidden: false, reason: "restored" });
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("handling feedback thanks its sender; anonymous feedback and reopening notify nobody", async () => {
        adminFeedbackDb.lockFeedback.mockResolvedValueOnce({ id: "f1", handled_at: null, title: "Dark mode", user_id: "u5" });
        await adminFeedbackService.setFeedbackHandled({ actor, feedbackId: "f1", handled: true });
        expect(notify).toHaveBeenCalledWith("u5", expect.objectContaining({ kind: "feedback_handled", dedupeKey: "f1", message: expect.stringContaining("Dark mode") }));

        adminFeedbackDb.lockFeedback.mockResolvedValueOnce({ id: "f2", handled_at: null, title: "x", user_id: null });
        await adminFeedbackService.setFeedbackHandled({ actor, feedbackId: "f2", handled: true });
        adminFeedbackDb.lockFeedback.mockResolvedValueOnce({ id: "f1", handled_at: "2026-11-04", title: "Dark mode", user_id: "u5" });
        await adminFeedbackService.setFeedbackHandled({ actor, feedbackId: "f1", handled: false });
        expect(notify).toHaveBeenCalledTimes(1);
    });
});
