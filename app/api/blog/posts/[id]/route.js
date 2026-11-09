import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { postPatchSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postId = (value) => {
    if (!POST_ID.test(value ?? "")) throw new ApiError("Invalid post id", 400);
    return value;
};

// GET: one of the caller's own posts (for the editor).
export const GET = apiRoute(
    async ({ userId, params }) => blogService.getOwn({ userId, postId: postId(params.id) }),
    { context: "api/blog/posts/[id]" }
);

// PATCH { title, tags, body, submit }: edit or resubmit an own post (same 160 KB cap as POST).
export const PATCH = apiRoute(
    async ({ req, userId, params }) =>
        blogService.update({ userId, postId: postId(params.id), input: parseOrThrow(postPatchSchema, await readJson(req, 160 * 1024)) }),
    { context: "api/blog/posts/[id]", csrf: true, limiter: rateLimiters.blogWrite }
);

// DELETE: remove an own post.
export const DELETE = apiRoute(
    async ({ userId, params }) => blogService.remove({ userId, postId: postId(params.id) }),
    { context: "api/blog/posts/[id]", csrf: true, limiter: rateLimiters.blogWrite }
);
