// setPostLikeAction: validates the post id and routes to like or unlike (runAction itself: __tests__/lists/serverAction.test.js).
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = { like: vi.fn(), unlike: vi.fn() };
vi.mock("@/services/blogInteraction.service", () => ({ blogInteractionService: svc }));
vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const { setPostLikeAction } = await import("@/actions/blog.actions");
const POST = `pst_${"a".repeat(26)}`;

describe("setPostLikeAction", () => {
    beforeEach(() => {
        svc.like.mockReset().mockResolvedValue({ liked: true, likeCount: 1 });
        svc.unlike.mockReset().mockResolvedValue({ liked: false, likeCount: 0 });
    });

    it("likes when liked is true, with the vote limiter", async () => {
        const result = await setPostLikeAction({ postId: POST, liked: true });
        expect(result).toMatchObject({ success: true, data: { liked: true, likeCount: 1 } });
        expect(svc.like).toHaveBeenCalledWith({ userId: "u1", postId: POST });
        expect(result.options.limiter).toBeDefined();
        expect(svc.unlike).not.toHaveBeenCalled();
    });

    it("unlikes otherwise", async () => {
        await setPostLikeAction({ postId: POST, liked: false });
        expect(svc.unlike).toHaveBeenCalledWith({ userId: "u1", postId: POST });
        expect(svc.like).not.toHaveBeenCalled();
    });

    it("rejects a malformed post id before any write", async () => {
        expect(await setPostLikeAction({ postId: "pst_../x", liked: true })).toMatchObject({ success: false, status: 400 });
        expect(svc.like).not.toHaveBeenCalled();
    });
});
