import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
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
