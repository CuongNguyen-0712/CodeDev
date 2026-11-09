import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;

// GET: live counts plus the caller's liked / reported / own flags (guests get all false).
export const GET = apiRoute(
    async ({ userId, params }) => {
        if (!POST_ID.test(params.id ?? "")) throw new ApiError("Invalid post id", 400);
        return blogInteractionService.viewer({ userId, postId: params.id });
    },
    { context: "api/blog/posts/[id]/viewer", auth: "optional" }
);
