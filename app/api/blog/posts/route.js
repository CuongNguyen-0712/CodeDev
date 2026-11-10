import { apiRoute } from "@/lib/routeHandler";
import { postListSchema } from "@/lib/validation/blog";
import { parseOrThrow } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";

// GET ?tag=&cursor=: published posts, newest first. Public, but never cached: hidden posts must vanish at once.
export const GET = apiRoute(
    async ({ req }) => {
        const input = parseOrThrow(postListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return blogService.listPublished({ tag: input.tag, cursor: input.cursor });
    },
    { context: "api/blog/posts", auth: "none" }
);
