import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminBlogService } from "@/services/adminBlog.service";

// GET ?cursor=: every non-deleted comment, newest first.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "blog.moderate"]);
        return adminBlogService.listComments({ cursor: new URL(req.url).searchParams.get("cursor") || null });
    },
    { context: "api/admin/blog/comments" }
);
