// Server actions for privacy, notifications and avatar history: validation, routing and limiters (runAction itself: __tests__/lists/serverAction.test.js).
import { beforeEach, describe, expect, it, vi } from "vitest";

const profile = { updatePrivacy: vi.fn() };
const notify = { markRead: vi.fn(), markAllRead: vi.fn(), dismiss: vi.fn() };
const media = { restoreAvatar: vi.fn(), deleteAvatar: vi.fn(), listAvatars: vi.fn() };
vi.mock("@/services/profile.service", () => ({ profileService: profile }));
vi.mock("@/services/notification.service", async () => {
    const actual = await vi.importActual("@/services/notification.service");
    return { decodeNotificationCursor: actual.decodeNotificationCursor, notificationService: notify };
});
vi.mock("@/db/notification.db", () => ({ notificationDb: {} }));
vi.mock("@/lib/pusher", () => ({ publishToUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ parseUtcTimestamp: (v) => v }));
vi.mock("@/services/media.service", () => ({ mediaService: media }));
vi.mock("@/services/user.service", () => ({ userService: {} }));
vi.mock("@/db/user.db", () => ({ userDb: {} }));
vi.mock("@/services/emailVerification.service", () => ({ emailVerificationService: {} }));
vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const actions = await import("@/actions/user.actions");
const { updatePrivacyAction, markNotificationsAction } = actions;
const { rateLimiters } = await import("@/lib/rateLimit");
const UUID = "6f3a1c2e-0000-4000-8000-000000000001";
const ASSET = `ast_${"c".repeat(26)}`;

beforeEach(() => {
    profile.updatePrivacy.mockReset().mockResolvedValue({});
    notify.markRead.mockReset().mockResolvedValue({ updated: 1 });
    notify.markAllRead.mockReset().mockResolvedValue({ updated: 2 });
    notify.dismiss.mockReset().mockResolvedValue({ updated: 1 });
    media.restoreAvatar.mockReset().mockResolvedValue({ image: "x" });
    media.deleteAvatar.mockReset().mockResolvedValue({ deleted: true });
});

describe("user actions", () => {
    it("updatePrivacyAction updates the session user's profile only, with the profile limiter", async () => {
        const result = await updatePrivacyAction({ showProfile: false, userId: "usr_attacker" });
        expect(profile.updatePrivacy.mock.calls[0][0]).toBe("u1");
        expect(result.options.limiter).toBe(rateLimiters.profile);
    });

    it.each([undefined, null, {}, { ids: [] }, { ids: ["not-a-uuid"] }, { ids: Array(101).fill(UUID) }])(
        "markNotificationsAction(%j) is a 400 before any write", async (body) => {
            expect(await markNotificationsAction(body)).toMatchObject({ success: false, status: 400 });
            expect(notify.markRead).not.toHaveBeenCalled();
            expect(notify.dismiss).not.toHaveBeenCalled();
        });

    it("markNotificationsAction marks by ids, all, or dismisses ids", async () => {
        await markNotificationsAction({ ids: [UUID] });
        expect(notify.markRead).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
        await markNotificationsAction({ ids: [UUID], dismiss: true });
        expect(notify.dismiss).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
        const result = await markNotificationsAction({ all: true });
        expect(notify.markAllRead).toHaveBeenCalledWith({ userId: "u1" });
        expect(result.options.limiter).toBe(rateLimiters.profile);
    });

    it("all with dismiss only marks read, never dismisses every item", async () => {
        await markNotificationsAction({ all: true, dismiss: true });
        expect(notify.markAllRead).toHaveBeenCalledTimes(1);
        expect(notify.dismiss).not.toHaveBeenCalled();
    });

    it.each([["restoreAvatarAction", "restoreAvatar"], ["deleteAvatarAction", "deleteAvatar"]])(
        "%s needs an asset id, with the upload limiter", async (action, method) => {
            const run = actions[action];
            for (const bad of [undefined, "", "ast_x", { assetId: ASSET }]) {
                expect(await run(bad)).toMatchObject({ success: false, status: 400, message: "A valid assetId is required" });
            }
            expect(media[method]).not.toHaveBeenCalled();
            const result = await run(ASSET);
            expect(media[method]).toHaveBeenCalledWith({ userId: "u1", assetId: ASSET });
            expect(result.options.limiter).toBe(rateLimiters.upload);
        });

    it("the privacy, notifications and avatars routes keep only their reads", async () => {
        for (const path of ["privacy", "notifications", "avatars"]) {
            const mod = await import(`@/app/api/user/${path}/route`);
            expect([mod.PATCH, mod.DELETE]).toEqual([undefined, undefined]);
            expect(mod.GET).toBeTypeOf("function");
        }
    });
});
