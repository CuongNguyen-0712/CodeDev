import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { blogInteractionService } from "@/services/blogInteraction.service";

// GET ?ids=pst_a,pst_b: for up to 50 posts, which the caller liked and their live counts, so a feed needs one request.
// { ids, counts: { [postId]: { likeCount, commentCount } } }; guests get ids [] and real counts.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const raw = new URL(req.url).searchParams.get("ids") ?? "";
        return blogInteractionService.feedState({ userId, postIds: raw ? raw.split(",") : [] });
    },
    { context: "api/blog/likes", auth: "optional", limiter: rateLimiters.commentRead }
);
