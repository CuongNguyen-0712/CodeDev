import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminBlogListSchema } from "@/lib/validation/blog";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminBlogService } from "@/services/adminBlog.service";

// GET ?status=pending|appeal|hidden|rejected|published&cursor=: learners' blog posts for review.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "blog.moderate"]);
        const input = parseOrThrow(adminBlogListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminBlogService.list({ status: input.status, cursor: input.cursor });
    },
    { context: "api/admin/blog" }
);
