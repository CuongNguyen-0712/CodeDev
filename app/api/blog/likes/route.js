import { apiRoute } from "@/lib/routeHandler";
import { blogInteractionService } from "@/services/blogInteraction.service";

// GET ?ids=pst_a,pst_b: which of up to 50 posts the caller has liked, so a feed needs one request.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const raw = new URL(req.url).searchParams.get("ids") ?? "";
        return { ids: await blogInteractionService.likedIds({ userId, postIds: raw ? raw.split(",") : [] }) };
    },
    { context: "api/blog/likes", auth: "optional" }
);
