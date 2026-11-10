// Server actions for blog posts (like, create, edit, delete): validation, routing and limiters (runAction itself: __tests__/lists/serverAction.test.js).
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = { like: vi.fn(), unlike: vi.fn() };
const post = { create: vi.fn(), update: vi.fn(), remove: vi.fn() };
vi.mock("@/services/blog.service", () => ({ blogService: post }));
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

const { setPostLikeAction, createPostAction, updatePostAction, deletePostAction } = await import("@/actions/blog.actions");
const { rateLimiters } = await import("@/lib/rateLimit");
const POST = `pst_${"a".repeat(26)}`;
const draft = { title: "A long post", tags: ["js"], body: "Hello", submit: false };

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

    it("returns 400 instead of rejecting when called with null", async () => {
        expect(await setPostLikeAction(null)).toMatchObject({ success: false, status: 400 });
    });

    it("rejects a malformed post id before any write", async () => {
        expect(await setPostLikeAction({ postId: "pst_../x", liked: true })).toMatchObject({ success: false, status: 400 });
        expect(svc.like).not.toHaveBeenCalled();
    });
});

describe("post write actions", () => {
    beforeEach(() => {
        post.create.mockReset().mockResolvedValue({ id: POST, slug: "a-post", status: "draft" });
        post.update.mockReset().mockResolvedValue({ id: POST, slug: "a-post", status: "draft" });
        post.remove.mockReset().mockResolvedValue({ deleted: true });
    });

    it("createPostAction parses the post and uses the blogCreate limiter", async () => {
        const result = await createPostAction(draft);
        expect(result).toMatchObject({ success: true, data: { id: POST, status: "draft" } });
        expect(post.create).toHaveBeenCalledWith({ userId: "u1", input: draft });
        expect(result.options.limiter).toBe(rateLimiters.blogCreate);
    });

    it("createPostAction accepts a 50,000-character multi-byte body", async () => {
        await createPostAction({ ...draft, body: "ả".repeat(50000) });
        expect(post.create.mock.calls[0][0].input.body).toHaveLength(50000);
    });

    it("createPostAction ignores a userId sent in the input", async () => {
        await createPostAction({ ...draft, userId: "usr_attacker" });
        expect(post.create.mock.calls[0][0].userId).toBe("u1");
        expect(post.create.mock.calls[0][0].input).not.toHaveProperty("userId");
    });

    it.each([undefined, null, {}, { title: "x" }])("createPostAction(%j) is a 400 before any write", async (input) => {
        expect(await createPostAction(input)).toMatchObject({ success: false, status: 400 });
        expect(post.create).not.toHaveBeenCalled();
    });

    it("updatePostAction checks the id first, then the patch, with the blogWrite limiter", async () => {
        expect(await updatePostAction({ id: "pst_../x", ...draft })).toMatchObject({ success: false, status: 400, message: "Invalid post id" });
        for (const bad of [undefined, null]) expect(await updatePostAction(bad)).toMatchObject({ success: false, status: 400, message: "Invalid post id" });
        expect(post.update).not.toHaveBeenCalled();
        const result = await updatePostAction({ id: POST, ...draft, appealReason: "Please look again at this" });
        expect(post.update).toHaveBeenCalledWith({ userId: "u1", postId: POST, input: { ...draft, appealReason: "Please look again at this" } });
        expect(result.options.limiter).toBe(rateLimiters.blogWrite);
    });

    it("deletePostAction removes only a well-formed id, with the blogWrite limiter", async () => {
        for (const bad of [undefined, "", "pst_x"]) expect(await deletePostAction(bad)).toMatchObject({ success: false, status: 400 });
        expect(post.remove).not.toHaveBeenCalled();
        const result = await deletePostAction(POST);
        expect(post.remove).toHaveBeenCalledWith({ userId: "u1", postId: POST });
        expect(result.options.limiter).toBe(rateLimiters.blogWrite);
    });

    it("the post routes keep only their reads", async () => {
        expect((await import("@/app/api/blog/posts/route")).POST).toBeUndefined();
        const byId = await import("@/app/api/blog/posts/[id]/route");
        expect([byId.PATCH, byId.DELETE]).toEqual([undefined, undefined]);
        expect(byId.GET).toBeTypeOf("function");
    });
});
