import { apiRoute } from "@/lib/routeHandler";
import { blogService } from "@/services/blog.service";

// GET: the signed-in learner's own posts, any status.
export const GET = apiRoute(async ({ userId }) => blogService.listMine({ userId }), { context: "api/blog/posts/mine" });
